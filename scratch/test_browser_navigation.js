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

    // Enable console and log events
    await sendCommand("Runtime.enable", {}, sessionId);
    await sendCommand("Log.enable", {}, sessionId);
    await sendCommand("Page.enable", {}, sessionId);

    console.log("Navigating to http://localhost:5173/pricing...");
    await sendCommand("Page.navigate", { url: "http://localhost:5173/pricing" }, sessionId);

    console.log("Waiting 6 seconds for rendering...");
    await new Promise(resolve => setTimeout(resolve, 6000));

    console.log("\n--- Evaluating URL and Page State ---");
    const locEval = await sendCommand("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true
    }, sessionId);
    console.log("Current URL after navigation:", locEval.result.result.value);

    const computedColors = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        // Force light mode
        document.documentElement.classList.add('light');
        
        const nav = document.querySelector('nav');
        if (!nav) return { error: 'No nav element found' };
        
        const logo = nav.querySelector('a') || nav;
        const toggle = nav.querySelector('button') || nav;
        
        return {
          navBg: window.getComputedStyle(nav).backgroundColor,
          navColor: window.getComputedStyle(nav).color,
          logoColor: window.getComputedStyle(logo).color,
          toggleColor: window.getComputedStyle(toggle).color,
          logoClassList: Array.from(logo.classList),
          navClassList: Array.from(nav.classList),
          htmlClassList: Array.from(document.documentElement.classList)
        };
      })()`,
      returnByValue: true
    }, sessionId);
    console.log("Computed Nav Colors in Browser:", JSON.stringify(computedColors.result.result.value, null, 2));

    const titleEval = await sendCommand("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true
    }, sessionId);
    console.log("Document Title:", titleEval.result.result.value);

    const bodyTextEval = await sendCommand("Runtime.evaluate", {
      expression: "document.body.innerText.substring(0, 1000)",
      returnByValue: true
    }, sessionId);
    console.log("First 1000 chars of body text:\n-------------------\n", bodyTextEval.result.result.value, "\n-------------------");

    const loadingSpinnerExists = await sendCommand("Runtime.evaluate", {
      expression: "!!document.querySelector('.animate-spin')",
      returnByValue: true
    }, sessionId);
    console.log("Is loading spinner visible on page?", loadingSpinnerExists.result.result.value);

    // Navigate back to original URL so we don't disrupt the user's view
    console.log("Navigating back to original page...");
    await sendCommand("Page.navigate", { url: originalUrl }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 2000));

    ws.close();
  } catch (err) {
    console.error("Error inside script:", err);
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

  // Intercept logs
  if (data.method === "Runtime.consoleAPICalled") {
    console.log("[Browser Console]", data.params.type, data.params.args.map(a => a.value || a.description || a));
  }
  if (data.method === "Runtime.exceptionThrown") {
    console.error("[Browser Exception]", data.params.exceptionDetails);
  }
};

ws.onerror = (err) => {
  console.error("WS Error:", err);
};

ws.onclose = () => {
  console.log("Connection closed.");
};
