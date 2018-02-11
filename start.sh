#!/usr/bin/env bash

set -eu

command="/usr/bin/google-chrome-unstable --no-sandbox --headless --disable-gpu --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222"

nohup $command &

bash -c "xargs chrome-har-capturer $@"