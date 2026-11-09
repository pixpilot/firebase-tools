#!/usr/bin/env node
import process from 'node:process';
import { runCli } from './run-cli';

const ARGUMENTS_START_INDEX = 2;

void runCli(process.argv.slice(ARGUMENTS_START_INDEX)).then((code) => {
  process.exitCode = code;
});
