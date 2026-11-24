import ipaddr from "ipaddr.js";

import { formatResponse } from "./response.js";
import { createProxyTunnels, createStream } from "../stream/manage.js";

export { normalizeRequest } from "./schema.js";

export function createResponse(type, data) {
    try {
        if (type === "tunnel") return formatResponse(type, data, { url: createStream(data) });
        if (type === "local-processing") return formatResponse(type, data, { tunnels: createProxyTunnels(data) });
        return formatResponse(type, data);
    } catch {
        return formatResponse("critical");
    }
}

export function getIP(req, prefix = 56) {
    const strippedIP = req.ip.replace(/^::ffff:/, '');
    const ip = ipaddr.parse(strippedIP);
    if (ip.kind() === 'ipv4') {
        return strippedIP;
    }

    const v6Bytes = ip.toByteArray();
          v6Bytes.fill(0, prefix / 8);

    return ipaddr.fromByteArray(v6Bytes).toString();
}
