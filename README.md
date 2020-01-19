# A Workerpool in TypeScript and Node

This repository is part of this article: TODO 

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