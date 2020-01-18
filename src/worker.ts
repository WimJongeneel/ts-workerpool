import { workerData, parentPort, threadId } from "worker_threads"

parentPort.on('message', (data: string) => {
  const [_, id, func] = data.split('::')
  console.log(`running task ${id} on thread ${threadId}`)
  const func1 = '(function run' + func.slice('function'.length) + ")"
  parentPort.postMessage("data::" + id + "::" + eval(func1)())
})
