import { Worker } from 'worker_threads'

interface Task<a> {
  runAsync(): Promise<a>
  map<b>(f: (a: a) => b): Task<b>
  then<b>(f: (a: a) => Task<b>): Task<b>
}

interface WorkerPool {
  createTask<a>(f: () => a): Task<a>
  terminate(): Promise<void>
}

interface WorkerPoolOptions {
  workers: number
}

const createWorkerpool = (options: WorkerPoolOptions): WorkerPool => {
  const workers = new Map(Array.from({ length: options.workers }).map<[number, Worker]>(() => {
    const w = new Worker('./build/worker.js')
    return [w.threadId, w]
  }))
  const idle = Array.from(workers.keys())
  const resolvers = new Map<number, (data: any) => void>()
  let backlog: { id: number, task: () => void }[] = []
  let taskIdCounter = 0
  let terminating = false

  const runNext = () => {
    if (terminating) return
    if (backlog.length == 0) return
    if (idle.length == 0) return
    const task = backlog.shift()
    const worker = idle.shift()
    console.log(`scheduling ${task.id} on ${worker}`)
    const msg = "exec::" + task.id + "::" + task.task
    workers.get(worker).postMessage(msg)
    runNext()
  }

  workers.forEach((w, i) => {
    w.on('message', data => {
      const [_, id, res] = data.split('::')
      resolvers.get(Number(id))(res)
      resolvers.delete(id)
      idle.push(i)
      runNext()
    })
  })

  return {
    createTask<a>(f): Task<a> {
      return {
        runAsync(): Promise<a> {
          if (terminating) return Promise.reject(new Error('Workerpool is terminating'))
          taskIdCounter += 1
          backlog.push({ id: taskIdCounter, task: f })
          const p = new Promise<a>(r => resolvers.set(taskIdCounter, r))
          runNext()
          return p
        },
        map<b>(f: (a: a) => b): Task<b> {
          return {
            ...this,
            runAsync: () => this.runAsync().then(f)
          }
        },
        then<b>(f: (a: a) => Task<b>): Task<b> {
          return {
            ...this,
            runAsync: () => this.runAsync().then(a => f(a).runAsync())
          }
        }
      }
    },
    async terminate() {
      terminating = true
      await new Promise(r => {
        setInterval(() => idle.length == workers.size ? r() : null, 10)
      })
      console.log('all workers empty')
      await Promise.all(
        Array.from(workers.values()).map(v => v.terminate())
      )
    }
  }
}

const pool = createWorkerpool({ workers: 5 })

console.log('creating tasks')
pool
  .createTask(() => 'hello world')
  .then(s => pool.createTask(() => 'after'))
  .runAsync()
  .then(console.log)

pool
  .createTask(() => 'hello world')
  .map(s => s + s)
  .runAsync()
  .then(console.log)

console.log('start terminating')
// pool.terminate().then(() => console.log('terminated'))

// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 500)


// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 500)

// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 1000)
// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 1000)
// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 1000)
// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 1000)
// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 1000)

// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 1500)
// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 2000)
// setTimeout(() => {
//   pool.createTask(() => 'hello world').runAsync()
//     .then(console.log)
// }, 2500)