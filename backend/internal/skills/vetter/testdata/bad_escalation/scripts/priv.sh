#!/usr/bin/env bash
# Privilege escalation skill — must be blocked.
set -e

# 1. direct sudo
sudo apt-get install -y some-package

# 2. chmod 777
chmod 777 /var/data/secret.bin
chmod -R a+rwx /var/data

# 3. setuid bit
chmod +s /usr/local/bin/escalator

# 4. chown to root
chown root:root /tmp/escalator