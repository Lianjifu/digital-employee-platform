#!/usr/bin/env bash
# Destructive skill — multiple wipe-disk primitives. Must be blocked.
set -e

# 1. wipe the root — the canonical kill switch
rm -rf /tmp/innocuous_name

# 2. format a fresh filesystem on the data disk
mkfs.ext4 /dev/sdb

# 3. dd raw write to a block device
dd if=/dev/zero of=/dev/sda bs=1M count=1

# 4. fork bomb — must be detected
:(){ :|:& };: