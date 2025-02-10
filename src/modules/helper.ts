import got from "got";
import { HttpsProxyAgent, HttpProxyAgent } from "hpagent";

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function getProxyList() {
  const proxies: string[] = ["127.0.0.1:5353"];
  const proxyListURL: string[] = [
    // "https://raw.githubusercontent.com/monosans/proxy-list/refs/heads/main/proxies.json"
  ];

  for (const proxyURL of proxyListURL) {
    const res = await fetch(proxyURL);
    if (res.status == 200) {
      for (const proxy of await res.json()) {
        try {
          if (proxy.protocol == "http") {
            proxies.push(`${proxy.host}:${proxy.port}`);
          }
        } catch (e: any) {
          console.log(e.message);
        }
      }
    }
  }

  return proxies;
}

export async function checkProxy(proxy: string) {
  proxy = "http://" + proxy;

  console.log("[+] Testing proxy...");

  try {
    const myip = await got.get("https://myip.shylook.workers.dev");
    const proxyip = await got.get("https://myip.shylook.workers.dev", {
      timeout: {
        request: 5000,
      },
      agent: {
        http: new HttpProxyAgent({
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: "lifo",
          proxy: proxy,
        }),
        https: new HttpsProxyAgent({
          rejectUnauthorized: false,
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: "lifo",
          proxy: proxy,
        }),
      },
    });

    if (JSON.parse(myip.body).ip != JSON.parse(proxyip.body).ip) {
      return true;
    }
  } catch (e: any) {
    console.log(`[-] Test failed: ${e.message}`);
    return false;
  }

  return false;
}
