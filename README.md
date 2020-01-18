# A Workerpool in TypeScript and Node

JavaScript' Promises and await/async are loved by developers for how they enable complex continuation logic to be writing in an elegant and simple way. But there is one thing that is imposible with them: true concurency where multiple bits of code run at the same time. The architecture of nodejs is setup in such a way that there is always one single process running on a single thread that executes all the code. Async is achieved by using the microtaskqueue that holds the next bits of code that will be executed. With tactical scheduling on this queue a function can be halted until a certain background tasks that runs outside node has completed, like a file operation or an network call. But it is imposible to let other JavaScript functions continue while another JavaScript funtion is running.

```ts
const api = async () => {
  const res = await fetch('/api')
  const json = await res.json()
  return json.value
}

api()

while(true) { /* this is a heavy task */}
```

In the codesample above the api call will be made, but everything in the `api` fucntion after that will never be executed because the process is blocked by the while loop. This can become a serious issue in big nodejs applications that process a lot of data. Some time ag workers where introduced to solve this problem. They allow developers to start an entirely new nodejs process that runs a script and can communicate back with the main process via a message system. However, this really is a new nodejs instance and has no shared memory like thread based systems have (e.g. multi-threading in C# or Java). This means that when you send data to a worker it will be cloned and recreated in the new runtime. This can be confusing when passing objects around and mutating them in one process. Those mutations will not be reflected on the other side!

## Resource pooling
In the previous paragraph we have discussed that creating workers is will create a new nodejs instance. This means that is a relavtive heavy task to create new workers. There is also the risk of creating to many workers and flooding the host system will processes.  This is where pooling comes in. We will create a certain amount of workers when we start our application and reuse those every time we want to run a task on another process. This collection of workers will be managed by the pool manager who accepts functions and will assign them to an idle worker. The function themselves will be wrapped in the Task interface which has methods for easy chaining and running of tasks. We can use Promises to make it easy to deal with this thruly asynchoronous code, just like with network and file operations that the nodejs host runs for us in the background.

## Creating a pool
We will start of by defining the general shape of our architecture. There will be one workerpool that will contain all the workers and queues with tasks. I decided to give the Workerpool one public method: `createTask`. This method will create a task that will run inside the pool that it was created in. The `Task` interface also has a single public method: `runAsync`. This method will run the wrapped function on a worker. The return value of this function is a Promise that resolves when a worker is done exeucting the function. Those interfaces are difiened as follows:

```ts
interface Task<a> {
  runAsync(): Promise<a>
}

interface Workerpool {
  createTask<a>(f: () => a): Task<a>
}
```

Implementing those interface will start of with creating a constructor for the workerpool.This function start of with defining all the internals of the pool:

* a map with workerids and workers that holds the workers that are part of our pool. Those workers will be created a single time and be reused for all the tasks the workerpool is going to execute.
* a collection with the ids of the workers that are idle and ready to accept an new task
* the backlog with tasks that have been queued and will be executed asap. Those tasks exist of an id, a function and the additional data to send to the worker.
* a map with taskid and resolvers. A resolver is the function that will be called when a worker has completed the task. Every task will have its own resolver.
* the counter that will be used to assign incremental task identifiers.

```ts
const createWorkerpool = (options: WorkerpoolOptions): Workerpool => {
  const workers = new Map(Array.from({ length: options.workers }).map<[number, Worker]>(() => {
    const w = new Worker('./build/worker.js')
    return [w.threadId, w]
  }))
  const idle = Array.from(workers.keys())
  const backlog: { taskId: number, task: () => void }[] = []
  const resolvers = new Map<number, (data: any) => void>()
  let taskIdCounter = 0

  return { /* ... */ }
```

The workers are constructed with a script that will be the main process of that nodejs instance. We will define its content later on. With those definitions in place we can start adding the logic for executing tasks. We will start this of by creating a function that will run the next tasks on the backlog if there is a worker ready. For this a certain steps have to be taken:

* check if we have both a task and an idle worker
* take the next task and idle worker
* create the message that will be send to the worker
* send the message to the worker

At the end we will call `runNext` again. In this way we will keep scheduling taks on workers as long as we have idle workers and tasks left. `runNext` should be called everytime we touch either the backlog or the `idle` collection. In this way we will always schedule the tasks as soon as posible.

```ts
const createWorkerpool = (options: WorkerpoolOptions): Workerpool => {
  /* ... */
  const runNext = () => {
    if (backlog.length == 0 || idle.length == 0) return
    const task = backlog.shift()
    const worker = idle.shift()
    console.log(`scheduling ${task.id} on ${worker}`)
    const msg = "exec::" + task.id + "::" + task.task
    workers.get(worker).postMessage(msg)
    runNext()
  }
  return { /* ... */ }
}
```

After this is it time to create the script that will run inside the workers. This script will listen for tasks to arive. When a task arrives it will run them and send the result back with the identifier. The script can be found below:

```ts
// worker.ts
import { workerData, parentPort, threadId } from "worker_threads"

parentPort.on('message', (data: string) => {
  const [_, id, func] = data.split('::')
  console.log(`running task ${id} on thread ${threadId}`)
  const func1 = '(function run' + func.slice('function'.length) + ")"
  parentPort.postMessage("data::" + id + "::" + eval(func1)())
})
```

The next thing that will happen is that the workerpool recieves the result and resolves the task. For this we add a `message` listener to all the workers. Inside here we call the resolver funtion for the taskid and put the worker on the list of idle tasks. At the end we call `runNext` so that the backlog will be processed and the new idle worker gets a task.

```ts
const createWorkerpool = (options: WorkerpoolOptions): Workerpool => {
  /* ... */
  workers.forEach((w, i) => {
    w.on('message', data => {
      const [_, id, res] = data.split('::')
      resolvers.get(Number(id))(res)
      resolvers.delete(id)
      idle.push(i)
      runNext()
    })
  })

  return { /* ... */ }
```

## create tasks
Now we have the internals of the workerpool is in place we can start creating and queueing tasks. The tasks will be created by a function that gets returned from `createWorkerpool`. This means that a task is always bounded to a specific workerpool. As the result of this our structure will look like this:

```ts
const createWorkerpool = (options: WorkerpoolOptions): Workerpool => {
  /* ... */

  return {
    createTask<a>(f): Task<a> {
      return {
        runAsync(): Promise<a> {
          // task creation
        }
      }
    }
  }
}
```

Inside the `createTask` nothing exiting happens, it just returns an object with the function that will run the task and uses the pool. To run a task we will have to add the task to the backlog, create and add an resolver function and call `runNext`. The resolver is the function that resolves the promise we will return from the `runAsync` function. This is why the resolver is set inside the Promise constructor, this is the only place where we have it (we are lifting the resolve function out of the Promise scope so we can later on resolve the Promise from the outside world). 

```ts
/* ... */

return {
  runAsync(): Promise<a> {
    taskIdCounter += 1
    backlog.push({ id: taskIdCounter, task: f })
    const p = new Promise<a>(r => resolvers.set(taskIdCounter, r))
    runNext()
    return p
  }
}
```

With both the workerpool and the tasks in place we can start running tasks.

```ts
const pool = createWorkerpool({ workers: 5 })

pool
  .createTask(() => 'hello world')
  .runAsync()
  .then(console.log)
```

## Combining tasks
With promisses its a common pattern to chain them with `then`. You could do that with our tasks if you would call `runAsync` and schedule a new task in the then of the Promise. But it would be more convinient if you could chain tasks togther and then call `runAsync` once to start running them in sequence. For this we will add the `then` to the `Task` interface. `then` will return an new task of which the `runAsync` will first run the first task and when that is completed queue the second one. With this we can chain tasks toghether to form one task that will run multiple functions in the background.

```ts
return {
  createTask<a>(f): Task<a> { /* ... */ },
  then<b>(f: (a: a) => Task<b>): Task<b> {
    return {
      ...this,
      runAsync: () => this.runAsync().then(a => f(a).runAsync())
    }
  }
}

// example

pool
  .createTask(() => 'first')
  .then(s => pool.createTask(() => 'second'))
  .runAsync()
  .then(console.log)
```

-- run in parallel

## Terminating the pool
The last feature we will look at is terminating the pool. When we terminate a pool we will stop accepting new tasks and shutdow all the workers. Here there is a choice to be made: let we first all workers complete the current tasks to do we kill them immediately and destroy their work?