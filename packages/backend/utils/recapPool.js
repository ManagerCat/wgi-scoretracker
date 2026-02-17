import { Worker } from "worker_threads";
import path from "path";

/**
 * Worker-pool that dispatches recap parsing jobs to worker threads.
 */
class RecapPool {
  constructor(size = 3) {
    this.size = size;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.nextJobId = 1;
    this._init();
  }

  _init() {
    for (let i = 0; i < this.size; i++) this._spawnWorker(i);
  }

  _spawnWorker(index) {
    const worker = new Worker(new URL("./recap-worker.js", import.meta.url), {
      type: "module",
    });
    worker._id = index;
    worker._busy = false;

    worker.on("message", (msg) => {
      // msg: { id, recaps } or { id, error }
      const { id, recaps, error } = msg || {};
      const job = this._inflight && this._inflight[id];
      if (job) {
        delete this._inflight[id];
        if (error) job.reject(new Error(error));
        else job.resolve(recaps);
      }
      worker._busy = false;
      this.idle.push(worker);
      this._dispatch();
    });

    worker.on("error", (err) => {
      console.error("recap worker error", err);
      // mark any inflight jobs as failed
      if (this._inflight) {
        for (const id in this._inflight) {
          const job = this._inflight[id];
          job.reject(new Error("Worker error: " + err.message));
          delete this._inflight[id];
        }
      }
    });

    worker.on("exit", (code) => {
      console.warn(`recap worker ${index} exited with code ${code}`);
      // remove worker from arrays
      this.workers = this.workers.filter((w) => w !== worker);
      this.idle = this.idle.filter((w) => w !== worker);
      // respawn to keep pool size (unless we're shutting down)
      if (!this._closing) this._spawnWorker(index);
    });

    this.workers.push(worker);
    this.idle.push(worker);
    if (!this._inflight) this._inflight = {};
  }

  /**
   * Enqueue a recap URL for parsing by the worker pool.
   * @param {string} url - Recap page URL
   * @returns {Promise<RawRecap[]>} Resolves with parsed recap data (raw strings)
   */
  enqueue(url) {
    return new Promise((resolve, reject) => {
      const id = String(this.nextJobId++);
      this.queue.push({ id, url, resolve, reject });
      this._dispatch();
    });
  }

  /**
   * Close the pool and terminate all workers. After calling this, the pool
   * will not respawn workers.
   * @returns {Promise<void>}
   */
  async close() {
    if (this._closing) return;
    this._closing = true;
    // clear queue and reject inflight jobs
    this.queue = [];
    if (this._inflight) {
      for (const id in this._inflight) {
        const job = this._inflight[id];
        try {
          job.reject(new Error("Pool shutting down"));
        } catch (e) {}
      }
      this._inflight = {};
    }
    // ask workers to shutdown gracefully and wait for exit; fallback to terminate
    const waitForExit = this.workers.map(
      (w) =>
        new Promise((resolve) => {
          let resolved = false;
          const onExit = (code) => {
            if (resolved) return;
            resolved = true;
            resolve(code);
          };
          w.once("exit", onExit);
          try {
            w.postMessage({ cmd: "shutdown" });
          } catch (e) {
            // if we can't post, terminate
          }
          // fallback: if worker doesn't exit within timeout, force terminate
          setTimeout(async () => {
            if (resolved) return;
            resolved = true;
            try {
              const code = await w.terminate();
              resolve(code);
            } catch (e) {
              resolve(1);
            }
          }, 5000);
        })
    );

    try {
      await Promise.all(waitForExit);
    } catch (e) {}
    this.workers = [];
    this.idle = [];
  }

  _dispatch() {
    if (!this.queue.length) return;
    if (!this.idle.length) return;
    const worker = this.idle.shift();
    const job = this.queue.shift();
    if (!worker || !job) return;
    worker._busy = true;
    // track inflight
    this._inflight[job.id] = job;
    // send job to worker
    console.log("Dispatcher: Sending job ", job.id, " to worker ", worker._id);
    worker.postMessage({ id: job.id, url: job.url });
  }
}

const pool = new RecapPool(3);

// Graceful shutdown handlers: attempt to close workers on signals
const _shutdown = async () => {
  try {
    await pool.close();
  } catch (e) {}
};
process.on("SIGINT", _shutdown);
process.on("SIGTERM", _shutdown);

export default pool;
