const axios = require('axios');

// Calls the (mock) payment provider.
//  - returns { ok: true, ref }            on success
//  - returns { ok: false, reason }        when the provider DECLINES (business failure)
//  - throws                               on timeout / 5xx / network error (technical failure)
module.exports = function createGatewayClient({ baseUrl, timeoutMs }) {
  return {
    async charge({ orderId, amount }, requestId) {
      const res = await axios.post(
        `${baseUrl}/api/v1/charge`,
        { orderId, amount },
        {
          timeout: timeoutMs,
          headers: { 'X-Request-Id': requestId },
          validateStatus: (s) => s < 500,
        },
      );
      if (res.status === 200 && res.data.ok) return { ok: true, ref: res.data.ref };
      return { ok: false, reason: (res.data && res.data.reason) || 'Payment declined' };
    },
  };
};
