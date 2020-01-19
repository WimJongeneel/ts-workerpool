import { Worker } from 'worker_threads'

interface Task<data, result> {
  runAsync(data: data): Promise<result>
  map<result2>(f: (o: result) => result2): Task<data, result2>
  then<result2>(f: Task<result, result2>): Task<data, result2>
}

interface WorkerPool {
  createTask<data, result>(f: (d: data) => result): Task<data, result>
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
  const resolvers = new Map<number, (data: any) => any>()
  const backlog: { id: number, task: (data: any) => void, data: any }[] = []
  let taskIdCounter = 0
  let terminating = false

  const runNext = () => {
    if(terminating) return
    if (backlog.length == 0 || idle.length == 0) return
    const task = backlog.shift()
    const worker = idle.shift()
    console.log(`scheduling ${task.id} on ${worker}`)
    const msg = { ...task, task: task.task.toString() }
    workers.get(worker).postMessage(msg)
    runNext()
  }

  workers.forEach((w, i) => {
    w.on('message', data => {
      const { id, result } = data
      console.log('res', result)
      resolvers.get(Number(id))(result)
      resolvers.delete(id)
      idle.push(i)
      runNext()
    })
  })

  return {
    createTask<data, result>(f): Task<data, result> {
      return {
        runAsync(data: data): Promise<result> {
          if (terminating) return Promise.reject(new Error('Workerpool is terminating'))
          taskIdCounter += 1
          backlog.push({ id: taskIdCounter, task: f, data })
          const p = new Promise<result>(r => resolvers.set(taskIdCounter, r))
          runNext()
          return p
        },
        map<result2>(f: (r: result) => result2): Task<data, result2> {
          return {
            ...this,
            runAsync: () => this.runAsync().then(f)
          }
        },
        then<result2>(t: Task<result, result2>): Task<data, result2> {
          return {
            ...this,
            runAsync: (d) => this.runAsync(d).then(a => t.runAsync(a))
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
const task = (n: number) => {
  const fibonacci = n => (n < 2) ? n : fibonacci(n - 2) + fibonacci(n - 1)
  return fibonacci(n)
}
pool.createTask(task)
  .then(pool.createTask(res => res * 2))
  .then(pool.createTask(res => 'res is: ' + res.toString()))
  .runAsync(30).then(console.log)