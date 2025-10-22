# Documentation Changes Summary

## Original Wiki Content (lines 47-51)

```markdown
You can roll back to a previous version by appending the version number to the command:

```shell
sudo hb-service update-node 20.10.0
```

### Windows 10
```

## Updated Wiki Content (lines 47-60)

```markdown
You can roll back to a previous version by appending the version number to the command:

```shell
sudo hb-service update-node 20.10.0
```

You can update to a newer major version by appending the major version number to the command:

```shell
sudo hb-service update-node 24
```

This will install the latest available version of Node.js 24.x (e.g., v24.9.0).

### Windows 10
```

## What Changed

**Added 7 new lines** between the rollback section and the Windows 10 section that:

1. Explains how to update to a newer major version
2. Provides a clear example: `sudo hb-service update-node 24`
3. Clarifies that this installs the latest version of that major release (e.g., v24.9.0)

This addresses the issue where users didn't know how to jump to a major version of Node.js.

## Context from the Issue

The user reported that when they tried:
- `hb-service update-node 24.0.9` - Failed (not a valid version)
- `hb-service update-node 24` - Succeeded (installed v24.9.0)

The documentation now clearly explains this behavior.
