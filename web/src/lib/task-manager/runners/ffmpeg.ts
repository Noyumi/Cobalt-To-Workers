import FFmpegWorker from "$lib/task-manager/workers/ffmpeg?worker";

import { killWorker } from "$lib/task-manager/run-worker";
import { updateWorkerProgress } from "$lib/state/task-manager/current-tasks";
import { pipelineTaskDone, itemError, queue } from "$lib/state/task-manager/queue";

import type { FileInfo } from "$lib/types/libav";
import type { CobaltQueue } from "$lib/types/queue";

const startupTimeout = 25_000;

export const runFFmpegWorker = async (
    workerId: string,
    parentId: string,
    files: File[],
    args: string[],
    output: FileInfo,
    variant: 'remux' | 'encode',
    yesthreads: boolean,
    retried = false,
) => {
    const worker = new FFmpegWorker();

    // A cold start includes downloading and compiling the LibAV Wasm binary.
    const startCheck = setTimeout(() => {
        killWorker(worker, unsubscribe, startCheck);
        if (retried) {
            return itemError(parentId, workerId, "queue.worker_didnt_start");
        }
        void runFFmpegWorker(workerId, parentId, files, args, output, variant, false, true);
    }, startupTimeout);

    const unsubscribe = queue.subscribe((queue: CobaltQueue) => {
        if (!queue[parentId]) {
            killWorker(worker, unsubscribe, startCheck);
        }
    });

    worker.postMessage({
        cobaltFFmpegWorker: {
            variant,
            files,
            args,
            output,
            yesthreads,
        }
    });

    worker.onerror = (e) => {
        console.error("ffmpeg worker crashed:", e);
        killWorker(worker, unsubscribe, startCheck);

        return itemError(parentId, workerId, "queue.generic_error");
    };

    let totalDuration: number | null = null;

    worker.onmessage = (event) => {
        const eventData = event.data.cobaltFFmpegWorker;
        if (!eventData) return;

        clearTimeout(startCheck);

        if (eventData.progress) {
            if (eventData.progress.duration) {
                totalDuration = eventData.progress.duration;
            }

            updateWorkerProgress(workerId, {
                percentage: totalDuration ? (eventData.progress.durationProcessed / totalDuration) * 100 : 0,
                size: eventData.progress.size,
            })
        }

        if (eventData.render) {
            killWorker(worker, unsubscribe, startCheck);
            return pipelineTaskDone(
                parentId,
                workerId,
                eventData.render,
            );
        }

        if (eventData.error) {
            killWorker(worker, unsubscribe, startCheck);
            return itemError(parentId, workerId, eventData.error);
        }
    };
}
