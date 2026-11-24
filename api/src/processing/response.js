import mime from "mime";

export function formatResponse(responseType, responseData, { url, tunnels } = {}) {
    const internalError = (code) => {
        return {
            status: 500,
            body: {
                status: "error",
                error: {
                    code: code || "error.api.fetch.critical.core",
                },
                critical: true
            }
        }
    }

    try {
        let status = 200,
            response = {};

        if (responseType === "error") {
            status = 400;
        }

        switch (responseType) {
            case "error":
                response = {
                    error: {
                        code: responseData?.code,
                        context: responseData?.context,
                    }
                }
                break;

            case "redirect":
                response = {
                    url: responseData?.url,
                    filename: responseData?.filename
                }
                break;

            case "tunnel":
                response = {
                    url,
                    filename: responseData?.filename
                }
                break;

            case "local-processing":
                response = {
                    type: responseData?.type,
                    service: responseData?.service,
                    tunnel: tunnels,

                    output: {
                        type: mime.getType(responseData?.filename) || undefined,
                        filename: responseData?.filename,
                        metadata: responseData?.fileMetadata || undefined,
                        subtitles: !!responseData?.subtitles || undefined,
                    },

                    audio: {
                        copy: responseData?.audioCopy,
                        format: responseData?.audioFormat,
                        bitrate: responseData?.audioBitrate,
                        cover: !!responseData?.cover || undefined,
                        cropCover: !!responseData?.cropCover || undefined,
                    },

                    isHLS: responseData?.isHLS,
                }

                if (!response.audio.format) {
                    if (response.type === "audio") {
                        // audio response without a format is invalid
                        return internalError();
                    }
                    delete response.audio;
                }

                if (!response.output.type || !response.output.filename) {
                    // response without a type or filename is invalid
                    return internalError();
                }
                break;

            case "picker":
                response = {
                    picker: responseData?.picker,
                    audio: responseData?.url,
                    audioFilename: responseData?.filename,
                    audioAvailable: responseData?.audioAvailable || undefined,
                }
                break;

            case "critical":
                return internalError(responseData?.code);

            default:
                throw "unreachable"
        }

        return {
            status,
            body: {
                status: responseType,
                ...response
            }
        }
    } catch {
        return internalError();
    }
}
