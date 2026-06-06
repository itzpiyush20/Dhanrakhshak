// Node 24 native WebSocket script to test rendering of the production site using the active tab
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
      console.error("No active page target found!");
      ws.close();
      return;
    }

    const originalUrl = pageTarget.url;
    console.log("Original Page URL:", originalUrl);

    console.log("Attaching to active tab target ID:", pageTarget.targetId);
    const attachRes = await sendCommand("Target.attachToTarget", {
      targetId: pageTarget.targetId,
      flatten: true
    });
    const sessionId = attachRes.result.sessionId;
    console.log("Attached! Session ID:", sessionId);

    // Enable domains
    await sendCommand("Runtime.enable", {}, sessionId);
    await sendCommand("Page.enable", {}, sessionId);

    const targetUrl = "https://dhanrakshak-five.vercel.app/";
    console.log("\nNavigating to production landing page:", targetUrl);
    await sendCommand("Page.navigate", { url: targetUrl }, sessionId);

    console.log("Waiting 6 seconds for React app to mount and render...");
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Evaluate URL and Title
    const locEval = await sendCommand("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true
    }, sessionId);
    console.log("Loaded Page URL:", locEval.result.result.value);

    // Check if sections and pricing links are visible on Landing Page
    const landingCheck = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const dailyUtility = document.getElementById('daily-utility');
        const features = document.getElementById('features');
        const anchors = Array.from(document.querySelectorAll('a')).map(a => ({
          text: a.innerText,
          href: a.getAttribute('href')
        }));
        
        return {
          hasDailyUtility: !!dailyUtility,
          dailyUtilityText: dailyUtility ? dailyUtility.innerText.substring(0, 100).replace(/\\s+/g, ' ') : null,
          hasFeatures: !!features,
          featuresText: features ? features.innerText.substring(0, 100).replace(/\\s+/g, ' ') : null,
          anchors: anchors.filter(a => a.text.toLowerCase().includes('pricing') || (a.href && a.href.includes('pricing')))
        };
      })()`,
      returnByValue: true
    }, sessionId);
    
    console.log("\nLanding Page Diagnostics:");
    console.log(JSON.stringify(landingCheck.result.result.value, null, 2));

    // Now navigate to pricing page
    console.log("\nNavigating to /pricing...");
    await sendCommand("Page.navigate", { url: "https://dhanrakshak-five.vercel.app/pricing" }, sessionId);

    console.log("Waiting 5 seconds for pricing page to load and render...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check pricing page content
    const pricingCheck = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const bodyText = document.body.innerText;
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText);
        const hasMonthly = bodyText.includes('Starter Monthly') || bodyText.includes('31');
        const hasAnnual = bodyText.includes('Investor Annual') || bodyText.includes('365');
        const hasRazorpay = bodyText.includes('Razorpay') || bodyText.includes('Secured via Razorpay');
        
        return {
          url: window.location.href,
          hasMonthly,
          hasAnnual,
          hasRazorpay,
          buttons: buttons.filter(b => b.trim().length > 0)
        };
      })()`,
      returnByValue: true
    }, sessionId);

    console.log("\nPricing Page Diagnostics:");
    console.log(JSON.stringify(pricingCheck.result.result.value, null, 2));

    console.log("\nRestoring tab to original URL:", originalUrl);
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

  if (data.method === "Runtime.consoleAPICalled") {
    console.log("[Console Log]", data.params.args.map(a => a.value || a.description || a));
  }
  if (data.method === "Runtime.exceptionThrown") {
    console.error("[Uncaught Exception]", data.params.exceptionDetails);
  }
};

ws.onclose = () => {
  console.log("Connection closed.");
};
