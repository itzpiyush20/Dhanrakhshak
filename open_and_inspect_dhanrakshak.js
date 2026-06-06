// Node 24 native WebSocket script to open Dhanrakshak in Antigravity client and inspect it
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
    console.log("Connected! Creating new target for Dhanrakshak at http://localhost:5173...");
    const createRes = await sendCommand("Target.createTarget", {
      url: "http://localhost:5173"
    });
    const targetId = createRes.result.targetId;
    console.log("Created target with ID:", targetId);

    console.log("Attaching to new target...");
    const attachRes = await sendCommand("Target.attachToTarget", {
      targetId: targetId,
      flatten: true
    });
    const sessionId = attachRes.result.sessionId;
    console.log("Attached! Session ID:", sessionId);

    // Enable domains
    await sendCommand("Runtime.enable", {}, sessionId);
    await sendCommand("Log.enable", {}, sessionId);
    await sendCommand("Page.enable", {}, sessionId);

    console.log("Waiting 10 seconds for page to load and network requests to fire...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log("\nChecking page state...");
    const locEval = await sendCommand("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true
    }, sessionId);
    console.log("Current Page URL:", locEval.result.result.value);

    const docTitle = await sendCommand("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true
    }, sessionId);
    console.log("Document Title:", docTitle.result.result.value);

    // Check console history or console logs collected by Runtime
    console.log("\nEvaluating diagnostics inside Dhanrakshak page...");
    
    // Check if Supabase client is initialized and check local storage
    const storageEval = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const items = {};
        for(let i=0; i<localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.includes('supabase') || key.startsWith('sb-')) {
            items[key] = localStorage.getItem(key);
          }
        }
        return {
          localStorageKeys: Object.keys(items),
          hasSession: Object.keys(items).some(k => k.endsWith('-auth-token'))
        };
      })()`,
      returnByValue: true
    }, sessionId);
    console.log("LocalStorage Supabase Status:", JSON.stringify(storageEval.result.result.value, null, 2));

    // Check if there are any visible errors in the HTML (like a timeout banner or react error boundary)
    const bodyHtml = await sendCommand("Runtime.evaluate", {
      expression: "document.body.innerText.substring(0, 1000)",
      returnByValue: true
    }, sessionId);
    console.log("Visible Text on Screen (first 1000 chars):\n", bodyHtml.result.result.value);

    // Let's test a Supabase fetch from the Dhanrakshak page context to see if it succeeds there
    const fetchEval = await sendCommand("Runtime.evaluate", {
      expression: `
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
            return { ok: r.ok, status: r.status, count: data.length, timeMs: t1 - t0 };
          } catch(e) {
            return { error: e.message || e.toString() };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);
    console.log("Supabase Fetch test from Dhanrakshak page:", JSON.stringify(fetchEval.result.result.value, null, 2));

    console.log("\nClosing target...");
    await sendCommand("Target.closeTarget", { targetId: targetId });
    console.log("Target closed.");

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

  // Intercept and print console logs from the Dhanrakshak target
  if (data.method === "Runtime.consoleAPICalled") {
    console.log("[Dhanrakshak Console]", data.params.type, data.params.args.map(a => a.value || a.description || a));
  }
  if (data.method === "Runtime.exceptionThrown") {
    console.error("[Dhanrakshak Uncaught Exception]", data.params.exceptionDetails);
  }
};

ws.onerror = (err) => {
  console.error("WS Error:", err);
};

ws.onclose = () => {
  console.log("Connection closed.");
};
