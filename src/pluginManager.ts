import type { Dirent } from 'node:fs'

import type {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPluginConstructor,
  HomebridgeAPI,
  PlatformIdentifier,
  PlatformName,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginName,
} from './api.js'

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'
import { inspect } from 'node:util'

import { InternalAPIEvent } from './api.js'
import { Logger } from './logger.js'
import { Plugin } from './plugin.js'

const log = Logger.internal
const require = createRequire(import.meta.url)
const paths = require.resolve.paths('')

/**
 * The `exports` field of a package.json: a file, a list of fallbacks, or a
 * map of sub-paths or conditions, nested to any depth.
 */
export type PackageExports = string | null | PackageExports[] | { [key: string]: PackageExports }

export interface PackageJSON { // incomplete type for package.json (just stuff we use here)
  name: string
  version: string
  keywords?: string[]

  // see https://nodejs.org/api/packages.html#package-entry-points
  exports?: PackageExports
  main?: string

  /**
   * When set as module, it marks .js file to be treated as ESM.
   * See https://nodejs.org/api/packages.html#type
   */
  type?: 'module' | 'commonjs'

  engines?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export interface PluginManagerOptions {
  /**
   * Additional path to search for plugins in. Specified relative to the current working directory.
   */
  customPluginPath?: string
  /**
   * If set, only load plugins from the customPluginPath, if set, otherwise only from the primary global node_modules.
   */
  strictPluginResolution?: boolean
  /**
   * When defined, only plugins specified here will be initialized.
   */
  activePlugins?: PluginIdentifier[]
  /**
   * Plugins that are marked as disabled and whose corresponding config blocks should be ignored
   */
  disabledPlugins?: PluginIdentifier[]
}

/**
 * Utility which exposes methods to search for installed Homebridge plugins
 */
export class PluginManager {
  // name must be prefixed with 'homebridge-' or '@scope/homebridge-'
  private static readonly PLUGIN_IDENTIFIER_PATTERN = /^((@[\w-]+(\.[\w-]+)*)\/)?(homebridge-[\w-]+)$/

  private readonly api: HomebridgeAPI

  private readonly searchPaths: Set<string> = new Set() // unique set of search paths we will use to discover installed plugins
  private readonly strictPluginResolution: boolean = false
  private readonly activePlugins?: PluginIdentifier[]
  private readonly disabledPlugins?: PluginIdentifier[]

  private readonly plugins: Map<PluginIdentifier, Plugin> = new Map()
  // we have some plugins which simply pass a wrong or misspelled plugin name to the api calls, this translation tries to mitigate this
  private readonly pluginIdentifierTranslation: Map<PluginIdentifier, PluginIdentifier> = new Map()
  private readonly accessoryToPluginMap: Map<AccessoryName, Plugin[]> = new Map()
  private readonly platformToPluginMap: Map<PlatformName, Plugin[]> = new Map()

  private currentInitializingPlugin?: Plugin // used to match registering plugins, see handleRegisterAccessory and handleRegisterPlatform

  /**
   * Determine whether a directory entry resolves to a directory. Dirent avoids
   * an extra stat call for ordinary directories and files, while the fallback
   * preserves discovery of npm-linked plugins and entries whose type is not
   * reported by the underlying filesystem.
   */
  private static isDirectoryEntry(parentPath: string, entry: Dirent): boolean {
    if (entry.isDirectory()) {
      return true
    }

    if (entry.isFile()) {
      return false
    }

    const absolutePath = resolve(parentPath, entry.name)
    try {
      return statSync(absolutePath).isDirectory()
    } catch (error: unknown) {
      log.debug(`Ignoring path ${absolutePath} - ${PluginManager.errorMessage(error)}`)
      return false
    }
  }

  constructor(api: HomebridgeAPI, options?: PluginManagerOptions) {
    this.api = api

    if (options) {
      if (options.customPluginPath) {
        this.searchPaths.add(resolve(process.cwd(), options.customPluginPath))
      }

      this.strictPluginResolution = options.strictPluginResolution || false

      // Both lists must be arrays — a stray string here turns later
      // `includes(...)` calls into substring matches against the user's
      // typo, producing surprising allow/block results. Warn on a non-array
      // value (e.g. `"plugins": "homebridge-foo"`) so the user notices the
      // typo rather than silently getting the "load every plugin" fallback.
      this.activePlugins = PluginManager.coerceIdentifierList(options.activePlugins, 'plugins')
      this.disabledPlugins = PluginManager.coerceIdentifierList(options.disabledPlugins, 'disabledPlugins')
    }

    this.api.on(InternalAPIEvent.REGISTER_ACCESSORY, this.handleRegisterAccessory.bind(this))
    this.api.on(InternalAPIEvent.REGISTER_PLATFORM, this.handleRegisterPlatform.bind(this))
  }

  /**
   * Coerce an options value to a `PluginIdentifier[]` or undefined.
   * Used for `activePlugins` and `disabledPlugins`: a stray string would
   * otherwise pass through and turn later `.includes(pluginIdentifier)`
   * calls into substring matches. Emits a warning so the typo isn't
   * silently swallowed into the "load everything" fallback.
   *
   * Exposed so tests can exercise the warning path without standing up a
   * full PluginManager.
   */
  public static coerceIdentifierList(value: unknown, fieldName: string): PluginIdentifier[] | undefined {
    if (value === undefined || value === null) {
      return undefined
    }
    if (Array.isArray(value)) {
      return value as PluginIdentifier[]
    }
    log.warn(`config.${fieldName} must be an array of plugin identifiers; got ${typeof value} — ignoring this setting.`)
    return undefined
  }

  /**
   * The message of a thrown value. A plugin can throw anything, not only an Error.
   */
  private static errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : String(error)
  }

  /**
   * The stack of a thrown Error, or the thrown value as text when it is not an Error
   * (`error.stack` of a thrown text is `undefined`, which said nothing in the log).
   */
  private static errorStack(error: unknown): string {
    return error instanceof Error
      ? (error.stack ?? error.message)
      : `A value that is not an Error was thrown: ${inspect(error)}`
  }

  public static isQualifiedPluginIdentifier(identifier: string): boolean {
    return PluginManager.PLUGIN_IDENTIFIER_PATTERN.test(identifier)
  }

  public static extractPluginName(name: string): PluginName { // extract plugin name without @scope/ prefix
    const match = name.match(PluginManager.PLUGIN_IDENTIFIER_PATTERN)
    if (!match) {
      throw new Error(`Cannot extract plugin name from invalid identifier: '${name}'`)
    }
    return match[4]
  }

  public static extractPluginScope(name: string): string { // extract the "@scope" of a npm module name
    const match = name.match(PluginManager.PLUGIN_IDENTIFIER_PATTERN)
    if (!match) {
      throw new Error(`Cannot extract plugin scope from invalid identifier: '${name}'`)
    }
    return match[2]
  }

  /**
   * Where the plugin part of an accessory or platform identifier ends (the index of the dot),
   * or -1 when the identifier is a bare name.
   *
   * The forms are `Name`, `homebridge-x.Name` and `@scope/homebridge-x.Name`. A scope may hold dots
   * (`@my.scope/homebridge-x.Name`), so for a scoped plugin only a dot after the `/` ends the plugin part.
   */
  private static pluginPartEnd(identifier: string): number {
    const packageStart = identifier.startsWith('@')
      ? identifier.indexOf('/') + 1
      : 0
    return identifier.indexOf('.', packageStart)
  }

  public static getAccessoryName(identifier: AccessoryIdentifier): AccessoryName {
    const end = PluginManager.pluginPartEnd(identifier)
    return end === -1
      ? identifier
      : identifier.slice(end + 1)
  }

  public static getPlatformName(identifier: PlatformIdentifier): PlatformName {
    const end = PluginManager.pluginPartEnd(identifier)
    return end === -1
      ? identifier
      : identifier.slice(end + 1)
  }

  public static getPluginIdentifier(identifier: AccessoryIdentifier | PlatformIdentifier): PluginIdentifier {
    const end = PluginManager.pluginPartEnd(identifier)
    return end === -1
      ? identifier
      : identifier.slice(0, end)
  }

  public async initializeInstalledPlugins(): Promise<void> {
    log.info('---')

    this.loadInstalledPlugins()

    for (const [identifier, plugin] of this.plugins) {
      try {
        await plugin.load()
      } catch (error: unknown) {
        log.error('====================')
        log.error(`ERROR LOADING PLUGIN ${identifier}:`)
        log.error(PluginManager.errorStack(error))
        log.error('====================')

        this.plugins.delete(identifier)
        continue
      }

      if (this.disabledPlugins && this.disabledPlugins.includes(plugin.getPluginIdentifier())) {
        plugin.disabled = true
      }

      if (plugin.disabled) {
        log.warn(`Disabled plugin: ${identifier}@${plugin.version}`)
      } else {
        log.info(`Loaded plugin: ${identifier}@${plugin.version}`)
      }

      await this.initializePlugin(plugin, identifier)

      log.info('---')
    }

    this.currentInitializingPlugin = undefined
  }

  public async initializePlugin(plugin: Plugin, identifier: string): Promise<void> {
    try {
      this.currentInitializingPlugin = plugin
      await plugin.initialize(this.api) // call the plugin's initializer and pass it our API instance
    } catch (error: unknown) {
      log.error('====================')
      log.error(`ERROR INITIALIZING PLUGIN ${identifier}:`)
      log.error(PluginManager.errorStack(error))
      log.error('====================')

      this.forgetPlugin(plugin, identifier)
    } finally {
      // Clear the in-progress reference so any late async registration that
      // fires after this initializer settles is rejected by the registration
      // handlers' guard rather than getting attributed to a stale (and now
      // possibly deleted) plugin.
      this.currentInitializingPlugin = undefined
    }
  }

  /**
   * Remove every trace of a plugin whose initializer failed. Anything it registered before it
   * failed must go too, or a config block that names the accessory or platform by its short name
   * would still be started from a plugin that was just reported as failed.
   */
  private forgetPlugin(plugin: Plugin, identifier: PluginIdentifier): void {
    this.plugins.delete(identifier)

    for (const nameMap of [this.accessoryToPluginMap, this.platformToPluginMap]) {
      for (const [name, plugins] of nameMap) {
        const remaining = plugins.filter(registered => registered !== plugin)
        if (remaining.length === 0) {
          nameMap.delete(name)
        } else if (remaining.length !== plugins.length) {
          nameMap.set(name, remaining)
        }
      }
    }

    for (const [wrongIdentifier, realIdentifier] of this.pluginIdentifierTranslation) {
      if (realIdentifier === identifier) {
        this.pluginIdentifierTranslation.delete(wrongIdentifier)
      }
    }
  }

  private handleRegisterAccessory(name: AccessoryName, constructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier): void {
    if (!this.currentInitializingPlugin) {
      throw new Error(`Unexpected accessory registration. Plugin ${pluginIdentifier
        ? `'${pluginIdentifier}' `
        : ''}tried to register outside the initializer function!`)
    }

    if (pluginIdentifier && pluginIdentifier !== this.currentInitializingPlugin.getPluginIdentifier()) {
      log.info(`Plugin '${this.currentInitializingPlugin.getPluginIdentifier()}' tried to register with an incorrect plugin identifier: '${pluginIdentifier}'. Please report this to the developer!`)
      this.pluginIdentifierTranslation.set(pluginIdentifier, this.currentInitializingPlugin.getPluginIdentifier())
    }

    this.currentInitializingPlugin.registerAccessory(name, constructor)

    let plugins = this.accessoryToPluginMap.get(name)
    if (!plugins) {
      plugins = []
      this.accessoryToPluginMap.set(name, plugins)
    }
    plugins.push(this.currentInitializingPlugin)
  }

  private handleRegisterPlatform(name: PlatformName, constructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier): void {
    if (!this.currentInitializingPlugin) {
      throw new Error(`Unexpected platform registration. Plugin ${pluginIdentifier
        ? `'${pluginIdentifier}' `
        : ''}tried to register outside the initializer function!`)
    }

    if (pluginIdentifier && pluginIdentifier !== this.currentInitializingPlugin.getPluginIdentifier()) {
      log.debug(`Plugin '${this.currentInitializingPlugin.getPluginIdentifier()}' tried to register with an incorrect plugin identifier: '${pluginIdentifier}'. Please report this to the developer!`)
      this.pluginIdentifierTranslation.set(pluginIdentifier, this.currentInitializingPlugin.getPluginIdentifier())
    }

    this.currentInitializingPlugin.registerPlatform(name, constructor)

    let plugins = this.platformToPluginMap.get(name)
    if (!plugins) {
      plugins = []
      this.platformToPluginMap.set(name, plugins)
    }
    plugins.push(this.currentInitializingPlugin)
  }

  public getPluginForAccessory(accessoryIdentifier: AccessoryIdentifier | AccessoryName): Plugin {
    return this.getPluginFor('accessory', accessoryIdentifier, this.accessoryToPluginMap)
  }

  public getPluginForPlatform(platformIdentifier: PlatformIdentifier | PlatformName): Plugin {
    return this.getPluginFor('platform', platformIdentifier, this.platformToPluginMap)
  }

  /**
   * The plugin behind an `accessory` or `platform` value of config.json: a bare name
   * (`Name`, which must then belong to exactly one enabled plugin) or the long form (`plugin.Name`).
   */
  private getPluginFor(kind: 'accessory' | 'platform', identifier: string, registeredNames: Map<string, Plugin[]>): Plugin {
    if (PluginManager.pluginPartEnd(identifier) === -1) { // see if it matches exactly one accessory or platform
      let found = registeredNames.get(identifier)

      if (!found) {
        throw new Error(`No plugin was found for the ${kind} "${identifier}" in your config.json. Please make sure the corresponding plugin is installed correctly.`)
      }

      if (found.length > 1) {
        const options = found.map(plugin => `${plugin.getPluginIdentifier()}.${identifier}`).join(', ')
        // check if only one of the multiple plugins is not disabled
        found = found.filter(plugin => !plugin.disabled)
        if (found.length !== 1) {
          throw new Error(`The requested ${kind} '${identifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`)
        }
      }

      return found[0]
    }

    const pluginIdentifier = PluginManager.getPluginIdentifier(identifier)
    const plugin = this.getPlugin(pluginIdentifier)
    if (!plugin) {
      throw new Error(`The requested plugin '${pluginIdentifier}' was not registered.`)
    }

    return plugin
  }

  public hasPluginRegistered(pluginIdentifier: PluginIdentifier): boolean {
    return this.plugins.has(pluginIdentifier) || this.pluginIdentifierTranslation.has(pluginIdentifier)
  }

  public getPlugin(pluginIdentifier: PluginIdentifier): Plugin | undefined {
    const plugin = this.plugins.get(pluginIdentifier)
    if (plugin) {
      return plugin
    } else {
      const translation = this.pluginIdentifierTranslation.get(pluginIdentifier)
      if (translation) {
        return this.plugins.get(translation)
      }
    }

    return undefined
  }

  public getPluginByActiveDynamicPlatform(platformName: PlatformName): Plugin | undefined {
    const found = (this.platformToPluginMap.get(platformName) || [])
      .filter(plugin => !!plugin.getActiveDynamicPlatform(platformName))

    if (found.length === 0) {
      return undefined
    } else if (found.length > 1) {
      const plugins = found.map(plugin => plugin.getPluginIdentifier()).join(', ')
      throw new Error(`'${platformName}' is an ambiguous platform name. It was registered by multiple plugins: ${plugins}`)
    } else {
      return found[0]
    }
  }

  /**
   * Gets all plugins installed on the local system
   */
  private loadInstalledPlugins(): void {
    this.loadDefaultPaths()

    this.searchPaths.forEach((searchPath) => { // search for plugins among all known paths
      if (!existsSync(searchPath)) { // just because this path is in require.main.paths doesn't mean it necessarily exists!
        return
      }

      if (existsSync(join(searchPath, 'package.json'))) { // does this path point inside a single plugin and not a directory containing plugins?
        try {
          // The `plugins` allow-list of config.json counts here too. The folder may have any name
          // (a checkout, a linked folder), so the name in its package.json is what is compared.
          const pluginIdentifier = PluginManager.loadPackageJSON(searchPath).name
          if (this.activePlugins && !this.activePlugins.includes(pluginIdentifier)) {
            log.info(`Not loading plugin '${pluginIdentifier}' found at '${searchPath}', as it is not in the "plugins" list of your config.json.`)
            return
          }
          this.loadPlugin(searchPath)
        } catch (error: unknown) {
          log.warn(PluginManager.errorMessage(error))
        }
      } else { // read through each directory in this node_modules folder
        let relativePluginPaths = readdirSync(searchPath, { withFileTypes: true })
          .filter(entry => PluginManager.isDirectoryEntry(searchPath, entry))
          .map(entry => entry.name)

        // expand out @scoped plugins
        const scopeDirectories = relativePluginPaths.filter(path => path.startsWith('@'))
        relativePluginPaths = relativePluginPaths.filter(path => !path.startsWith('@'))

        for (const scopeDirectory of scopeDirectories) {
          const absolutePath = join(searchPath, scopeDirectory)
          readdirSync(absolutePath, { withFileTypes: true })
            .filter(entry => PluginManager.isQualifiedPluginIdentifier(entry.name))
            .filter(entry => PluginManager.isDirectoryEntry(absolutePath, entry))
            .forEach(entry => relativePluginPaths.push(`${scopeDirectory}/${entry.name}`))
        }

        relativePluginPaths
          .filter((pluginIdentifier) => {
            return PluginManager.isQualifiedPluginIdentifier(pluginIdentifier) // needs to be a valid homebridge plugin name
              && (!this.activePlugins || this.activePlugins.includes(pluginIdentifier)) // check if activePlugins is restricted and if so is the plugin is contained
          })
          .forEach((pluginIdentifier) => {
            try {
              const absolutePath = resolve(searchPath, pluginIdentifier)
              this.loadPlugin(absolutePath)
            } catch (error: unknown) {
              log.warn(PluginManager.errorMessage(error))
            }
          })
      }
    })

    if (this.plugins.size === 0) {
      log.warn('No plugins found.')
    }
  }

  public loadPlugin(absolutePath: string): Plugin {
    const packageJson: PackageJSON = PluginManager.loadPackageJSON(absolutePath)

    const identifier: PluginIdentifier = packageJson.name
    const name: PluginName = PluginManager.extractPluginName(identifier)
    const scope = PluginManager.extractPluginScope(identifier) // possibly undefined

    const alreadyInstalled = this.plugins.get(identifier) // check if there is already a plugin with the same Identifier
    if (alreadyInstalled) {
      throw new Error(`Warning: skipping plugin found at '${absolutePath}' since we already loaded the same plugin from '${alreadyInstalled.getPluginPath()}'.`)
    }

    const plugin = new Plugin(name, absolutePath, packageJson, scope)
    this.plugins.set(identifier, plugin)
    return plugin
  }

  private static loadPackageJSON(pluginPath: string): PackageJSON {
    const packageJsonPath = join(pluginPath, 'package.json')
    let packageJson: PackageJSON

    if (!existsSync(packageJsonPath)) {
      throw new Error(`Plugin ${pluginPath} does not contain a package.json.`)
    }

    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' })) // attempt to parse package.json
    } catch (error: unknown) {
      throw new Error(`Plugin ${pluginPath} contains an invalid package.json. Error: ${error}`)
    }

    // the file can hold anything: `null`, a list, a name that is a number
    if (typeof packageJson !== 'object' || packageJson === null || typeof packageJson.name !== 'string' || !PluginManager.isQualifiedPluginIdentifier(packageJson.name)) {
      throw new Error(`Plugin ${pluginPath} does not have a package name that begins with 'homebridge-' or '@scope/homebridge-'.`)
    }

    // verify that it's tagged with the correct keyword
    if (!packageJson.keywords || !packageJson.keywords.includes('homebridge-plugin')) {
      throw new Error(`Plugin ${pluginPath} package.json does not contain the keyword 'homebridge-plugin'.`)
    }

    return packageJson
  }

  private loadDefaultPaths(): void {
    if (this.strictPluginResolution) {
      // if strict plugin resolution is enabled:
      // * only use custom plugin path, if set;
      // * otherwise add the current npm global prefix (e.g. /usr/local/lib/node_modules)
      if (this.searchPaths.size === 0) {
        this.addNpmPrefixToSearchPaths()
      }
      return
    }

    if (paths) {
      // add the paths used by require()
      paths.forEach(path => this.searchPaths.add(path))
    }

    // Add the global npm folders: the ones named in NODE_PATH, or else the usual places
    // plus the folder npm itself reports (`npm -g prefix`, see addNpmPrefixToSearchPaths).
    if (process.env.NODE_PATH) {
      process.env
        .NODE_PATH
        .split(delimiter)
        .filter(path => !!path) // trim out empty values
        .forEach(path => this.searchPaths.add(path))
    } else {
      // Default paths for non-windows systems
      if (process.platform !== 'win32') {
        this.searchPaths.add('/usr/local/lib/node_modules')
        this.searchPaths.add('/usr/lib/node_modules')
      }
      this.addNpmPrefixToSearchPaths()
    }
  }

  private addNpmPrefixToSearchPaths(): void {
    // Best effort: this adds one more folder to search, on top of NODE_PATH
    // and node's own module paths. When it can not be worked out (npm is not
    // on the PATH of a service, npm exits with an error, APPDATA is not set)
    // Homebridge carries on with the folders it has, and must not fail to start.
    try {
      if (process.platform === 'win32') {
        if (process.env.APPDATA) {
          this.searchPaths.add(join(process.env.APPDATA, 'npm/node_modules'))
        } else {
          log.debug('APPDATA is not set, so the global npm folder is not searched for plugins.')
        }
        return
      }

      // Spread process.env first so our explicit silencing keys actually
      // override anything the user has exported (e.g. npm_config_loglevel=info)
      // — otherwise startup gets noisy npm output we tried to suppress.
      const npmPrefix = execFileSync('npm', ['-g', 'prefix'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_loglevel: 'silent',
          npm_update_notifier: 'false',
        },
      }).trim()
      this.searchPaths.add(join(npmPrefix, 'lib', 'node_modules'))
    } catch (error: unknown) {
      log.debug('Could not find the global npm folder, so it is not searched for plugins:', error instanceof Error
        ? error.message
        : error)
    }
  }
}
