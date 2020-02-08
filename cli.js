#!/usr/bin/env node

const exp = require('./exp');

const args = process.argv.slice(2);
let dirs = [];
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("dir=")) {
        dirs.push(arg.substring("dir=".length));
    }
    if (arg.startsWith("tesults-target=")) {
        exp.tesults.target = arg.substring("tesults-target=".length);
    }
}
exp.dirs = dirs;
exp.start();