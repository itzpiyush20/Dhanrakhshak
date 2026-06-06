// Node 24 native WebSocket script to temporarily navigate active tab to Dhanrakshak and capture console logs
const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
  console.error("AGY_BROWSER_WS_URL is not set!");
  process.exit(1);
}

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

    const originalUrl = pageTarget.url;
    console.log("Original Page URL:", originalUrl);

    console.log("Attaching to target...");
    const attachRes = await sendCommand("Target.attachToTarget", {
      targetId: pageTarget.targetId,
      flatten: true
    });
    const sessionId = attachRes.result.sessionId;
    console.log("Attached! Session ID:", sessionId);

    // Enable console events
    await sendCommand("Runtime.enable", {}, sessionId);
    await sendCommand("Log.enable", {}, sessionId);

    console.log("Navigating to Dhanrakshak (http://localhost:3000)...");
    await sendCommand("Page.navigate", { url: "http://localhost:3000" }, sessionId);

    console.log("Waiting 12 seconds for page to load and capturing all console logs...");
    await new Promise(resolve => setTimeout(resolve, 12000));

    console.log("Navigating back to subagent overview...");
    await sendCommand("Page.navigate", { url: originalUrl }, sessionId);

    console.log("Waiting 3 seconds to complete navigation back...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    ws.close();
  } catch (err) {
    console.error("Error:", err);
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

  // Log all console and runtime messages from target
  if (data.method === "Runtime.consoleAPICalled") {
    console.log("[Console]", data.params.type, data.params.args.map(a => a.value || a.description || a));
  }
  if (data.method === "Runtime.exceptionThrown") {
    console.error("[Uncaught Exception]", data.params.exceptionDetails);
  }
  if (data.method === "Log.entryAdded") {
    console.log("[Log Entry]", data.params.entry);
  }
};

ws.onerror = (err) => {
  console.error("WS Error:", err);
};

ws.onclose = () => {
  console.log("Connection closed.");
};
