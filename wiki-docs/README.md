# Wiki Documentation Updates

This directory contains updated wiki documentation files that need to be applied to the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki).

## Files in This Directory

- `Install-Homebridge-on-Red-Hat,-CentOS-or-Fedora-Linux.md` - Updated installation instructions for Red Hat, CentOS, and Fedora Linux

## How to Apply These Changes

The Homebridge wiki is maintained in a separate Git repository at `https://github.com/homebridge/homebridge.wiki.git`.

To apply these changes:

1. Clone the wiki repository:
   ```bash
   git clone https://github.com/homebridge/homebridge.wiki.git
   ```

2. Copy the updated file(s) from this directory to the wiki repository:
   ```bash
   cp wiki-docs/Install-Homebridge-on-Red-Hat,-CentOS-or-Fedora-Linux.md homebridge.wiki/
   ```

3. Commit and push the changes to the wiki repository:
   ```bash
   cd homebridge.wiki
   git add Install-Homebridge-on-Red-Hat,-CentOS-or-Fedora-Linux.md
   git commit -m "Update YUM to DNF commands for Red Hat/CentOS/Fedora"
   git push
   ```

## Changes Summary

### Install-Homebridge-on-Red-Hat,-CentOS-or-Fedora-Linux.md

- Updated `sudo yum install` to `sudo dnf install` (YUM is deprecated)
- Updated `sudo yum groupinstall -y 'Development Tools'` to `sudo dnf group install -y 'development-tools'`
  - Changed command from `groupinstall` to `group install` (required by DNF5)
  - Changed group name from `'Development Tools'` to `'development-tools'` (new naming convention)

These changes address compatibility issues with DNF5 where the old YUM commands no longer work.
