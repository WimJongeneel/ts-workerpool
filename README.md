# A Workerpool in TypeScript and Node

This repository is part an [article](https://itnext.io/a-workerpool-from-scratch-in-typescript-and-node-c4352106ffde?source=friends_link&sk=96f50c4fab122cf141287276af7e9ea8) on [ITNEXT](https://itnext.io). 

## Setup and running

All commands should be run in the root folder. This project uses yarn as a dependency manager. The need for the `--experimental-worker` flag depends on what your default node version is.

```
yarn
yarn tsc && node --experimental-worker build/main.js
```

With npm:
```
npm install
npm run tsc && node --experimental-worker build/main.js
```
