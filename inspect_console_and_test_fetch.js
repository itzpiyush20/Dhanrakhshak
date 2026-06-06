// Node 24 native WebSocket client to connect to CDP and inspect target
const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
  console.error("AGY_BROWSER_WS_URL is not set!");
  process.exit(1);
}

console.log("Connecting to Browser WebSocket:", wsUrl);
const ws = new WebSocket(wsUrl);

let msgId = 1;
const pendingRequests = new Map();

function sendCommand(method, params = {}, sessionId = undefined) {
  const id = msgId++;
  const payload = { id, method, params };
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify(payload));
  });
}

ws.onopen = async () => {
  try {
    const targetsRes = await sendCommand("Target.getTargets");
    const targets = targetsRes.result.targetInfos;
    const pageTarget = targets.find(t => t.type === "page");

    if (!pageTarget) {
      console.error("No page target found!");
      ws.close();
      return;
    }

    const attachRes = await sendCommand("Target.attachToTarget", {
      targetId: pageTarget.targetId,
      flatten: true
    });
    const sessionId = attachRes.result.sessionId;

    // Enable Runtime & Log
    await sendCommand("Runtime.enable", {}, sessionId);
    await sendCommand("Log.enable", {}, sessionId);

    // Let's run a test fetch to Supabase
    const fetchExpression = `
      (async () => {
        try {
          const t0 = performance.now();
          const r = await fetch("https://urmxysuwailvwwglxuxn.supabase.co/rest/v1/transactions?select=*", {
            headers: {
              "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybXh5c3V3YWlsdnd3Z2x4dXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODA4ODYsImV4cCI6MjA5NTU1Njg4Nn0.55yzAYoUScNXkgq7pOFW8BTW4GleV9LBnguz3Fad44g",
              "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybXh5c3V3YWlsdnd3Z2x4dXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODA4ODYsImV4cCI6MjA5NTU1Njg4Nn0.55yzAYoUScNXkgq7pOFW8BTW4GleV9LBnguz3Fad44g"
            }
          });
          const t1 = performance.now();
          const data = await r.json();
          return {
            success: true,
            status: r.status,
            statusText: r.statusText,
            count: data.length,
            timeMs: t1 - t0
          };
        } catch (err) {
          return {
            success: false,
            error: err.message || err.toString()
          };
        }
      })()
    `;

    const evalRes = await sendCommand("Runtime.evaluate", {
      expression: fetchExpression,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);

    console.log("\n--- TEST FETCH RESULT ---");
    console.log(JSON.stringify(evalRes, null, 2));

    const locEval = await sendCommand("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true
    }, sessionId);
    console.log("\n--- PAGE URL ---");
    console.log(JSON.stringify(locEval, null, 2));

    const diagEval = await sendCommand("Runtime.evaluate", {
      expression: `({
        onLine: navigator.onLine,
        userAgent: navigator.userAgent,
        referrer: document.referrer
      })`,
      returnByValue: true
    }, sessionId);
    console.log("\n--- BROWSER DIAGNOSTIC ---");
    console.log(JSON.stringify(diagEval, null, 2));

    ws.close();
  } catch (err) {
    console.error("Error in script:", err);
    ws.close();
  }
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.id && pendingRequests.has(data.id)) {
    const { resolve, reject } = pendingRequests.get(data.id);
    pendingRequests.delete(data.id);
    if (data.error) {
      reject(data.error);
    } else {
      resolve(data);
    }
  }
};

ws.onerror = (err) => {
  console.error("WS Error:", err);
};

ws.onclose = () => {
  console.log("Connection closed.");
};
