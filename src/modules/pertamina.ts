import got, { GotBodyOptions } from "got";
import { HttpsProxyAgent, HttpProxyAgent } from "hpagent";
import { sleep } from "bun";
import { chromium, devices } from "playwright";
import { Telegram } from "./telegram";
import comparePixelmatchBuffers from "./image";
import { dominantColorFromImageBuffer } from "./color";

export class Pertamina {
  private linkHome = "https://subsiditepatlpg.mypertamina.id/merchant/app";
  private linkTos = "https://subsiditepatlpg.mypertamina.id/merchant/app/onboarding/terms-conditions";
  private linkLogin = "https://subsiditepatlpg.mypertamina.id/merchant-login";
  private linkReport = "https://api-map.my-pertamina.id/general/v1/transactions/report";
  private linkProduct = "https://api-map.my-pertamina.id/general/v2/products";
  private linkProductUser = "https://api-map.my-pertamina.id/general/products/v1/products/user";
  private linkPersonal = "https://api-map.my-pertamina.id/general/v1/users/profile";
  private linkCheckNIK = "https://api-map.my-pertamina.id/customers/v2/verify-nik?nationalityId=";
  private linkTransaction = "https://api-map.my-pertamina.id/general/v1/transactions";
  private linkTransactionV2 = "https://api-map.my-pertamina.id/general/v2/transactions";

  private username: string;
  private password: string;
  private bearer: string;
  private browser = chromium.launch({
    headless: false,
    args: ["--proxy-server=127.0.0.1:5353"],
  });
  private page = this.browser.then(async (res) => await res.newPage());
  private options: GotBodyOptions<string>;

  private bot: Telegram;

  private stockMap: any = {
    "Usaha Mikro": 2,
    "Rumah Tangga": 1,
  };

  constructor(username: string, password: string, bearer: string, proxy: string) {
    this.username = username;
    this.password = password;
    this.bearer = bearer;

    this.bot = new Telegram();

    this.page.then((page) => {
      page.on("console", (msg) => {
        console.log(msg);
      });
    });

    this.options = {
      agent: {
        http: new HttpProxyAgent({
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: "lifo",
          proxy: "http://" + proxy,
        }),
        https: new HttpsProxyAgent({
          rejectUnauthorized: false,
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: "lifo",
          proxy: "http://" + proxy,
        }),
      },
      headers: {
        Authorization: this.bearer,
        "Content-Type": "application/json",
        Host: "api-map.my-pertamina.id",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        Origin: "https://subsiditepatlpg.mypertamina.id",
        Connection: "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        TE: "trailers",
        Referer: "https://subsiditepatlpg.mypertamina.id/",
        Priority: "u=4",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
    };
  }

  async login() {
    console.log(`[+] Login using ${this.username}...`);

    const page = await this.page;

    let message = "";

    page.on("request", async (request) => {
      const bearer = request.headers()["authorization"];
      if (bearer?.length >= 800) {
        message = bearer;
      }
    });

    await page.goto(this.linkLogin);
    await sleep(5000);

    try {
      const userForm = page.getByPlaceholder("Masukkan Nomor Ponsel atau Email");
      const passForm = page.getByPlaceholder("Masukkan nomor PIN Anda");
      const loginButton = page.getByRole("button", { name: "MASUK" });
      await userForm.pressSequentially(this.username);
      await passForm.pressSequentially(this.password);
      await loginButton.click();
    } catch (e: any) {
      console.error(e);
      await this.bot.sendPhotoToAdmin(await page.screenshot(), "[-] Error login: " + e.message);
    }

    for (let i = 0; i < 30; i++) {
      if (message.length > 800) break;
      await sleep(100);
    }

    if (message.length > 800) {
      if (this.options.headers) {
        this.options.headers = {
          ...this.options.headers,
          Authorization: message,
        };
      }

      if (page.url() == this.linkTos) {
        await page.click("#mantine-r2");
        await page.click("#mantine-r4-body > div:nth-child(3) > div:nth-child(1) > button:nth-child(1)");
        await page.click("#mantine-r3");
        await page.click("#mantine-r4-body > div:nth-child(3) > div:nth-child(1) > button:nth-child(1)");
        await page.click(".styles_contained__1kIDF");
      }
    } else {
      await this.bot.sendPhotoToAdmin(await page.screenshot(), "[-] Error login: no authorization headers");
    }

    return message;
  }

  async checkToken() {
    try {
      const res = await got(this.linkPersonal, {
        ...this.options,
      });

      if (res.statusCode == 200) {
        if (JSON.parse(res.body).success) {
          return true;
        }
      }
    } catch (e: any) {
      console.log("[-] Error checking token: " + e.message);
    }

    return false;
  }

  async getReport(date: string) {
    try {
      const req = await got(`${this.linkReport}?startDate=${date}&endDate=${date}`, {
        ...this.options,
      });
      if (req.statusCode == 200) {
        return JSON.parse(req.body);
      }
    } catch (e: any) {
      return e.message;
    }
  }

  async cancelDoubleTransaction() {
    const messages = [];

    try {
      const [yyyy, mm, dd] = new Date().toISOString().split("T")[0].split("-");
      const now = `${yyyy}-${mm}-${dd}`;
      const yesterday = `${yyyy}-${mm}-${parseInt(dd) - 1}`;

      for (const date of [now, yesterday]) {
        const report = await this.getReport(date);
        if (report && report.success) {
          for (const customerReport of report.data.customersReport) {
            if (customerReport.total > this.stockMap[customerReport.categories[0]]) {
              try {
                const req = await got(
                  `${this.linkTransaction}?startDate=${date}&endDate=${date}&customerReportId=${customerReport.customerReportId}`,
                  {
                    ...this.options,
                  }
                );

                if (req.statusCode == 200) {
                  const transactionReport = JSON.parse(req.body);
                  if (transactionReport.success) {
                    for (let i = 1; i < transactionReport.data.data.length; i++) {
                      const transaction = transactionReport.data.data[i];
                      if (!transaction.isCanceled) {
                        try {
                          const req = await got(`${this.linkTransaction}/${transaction.transactionId}/cancel`, {
                            method: "post",
                            body: JSON.stringify({
                              reason: "Salah",
                              pin: `${this.password}`,
                            }),
                            ...this.options,
                          });

                          if (JSON.parse(req.body).success) {
                            messages.push(`[🟡] Transaction for ${transaction.customerName} canceled!`);
                          }
                        } catch (e: any) {
                          messages.push(`[🔴] Error canceling transaction: ${e.message}`);
                        }
                      }
                    }
                  }
                }
              } catch (e: any) {
                messages.push(`[🔴] Error canceling transaction: ${e.message}`);
              }
            }
          }
        }
      }
    } catch (e: any) {
      return e.message;
    }

    return messages.join("\n");
  }

  async checkStock() {
    try {
      const req = await got(this.linkProductUser, {
        ...this.options,
      });

      if (req.statusCode == 200) {
        return JSON.parse(req.body).data.stockAvailable;
      }
    } catch (e: any) {
      console.log(`[-] Error getting stock!`);
    }

    return 0;
  }

  async getCustomer(nik: string) {
    try {
      const req = await got(this.linkCheckNIK + nik, {
        ...this.options,
      });
      return JSON.parse(req.body);
    } catch (e: any) {
      return e.message;
    }
  }

  async getProduct() {
    try {
      const req = await got(this.linkProductUser, {
        ...this.options,
      });

      if (req.statusCode == 200) {
        return JSON.parse(req.body);
      }
    } catch (e: any) {
      return e.message;
    }
  }

  async transaction(nik: string) {
    const page = await this.page;
    const product = await this.getProduct();
    const customer = await this.getCustomer(nik);

    if (product.success && customer.success) {
      // Check price
      if (product.data.price < 18000) {
        return {
          success: false,
          message: "price not configured",
          code: 460,
        };
      }

      const customerType = (() => {
        const typeNames: string[] = (customer.data.customerTypes as object[]).map((c: any) => c.name) as string[];

        if (typeNames.includes("Usaha Mikro")) {
          return customer.data.customerTypes[typeNames.indexOf("Usaha Mikro")];
        } else if (typeNames.includes("Rumah Tangga")) {
          return customer.data.customerTypes[typeNames.indexOf("Rumah Tangga")];
        }
      })();

      if (!customerType) {
        return {
          success: false,
          message: "NIK Error/Not Found",
          code: 404,
        };
      }

      try {
        await page.goto(this.linkHome);

        await page.getByText("Catat Penjualan").click();
        await sleep(200);
        await page.getByPlaceholder("Masukkan 16 digit NIK Pelanggan").pressSequentially(nik);
        await page.getByRole("button", { name: "LANJUTKAN PENJUALAN" }).click();
        const minButton = page.getByTestId("actionIcon1");
        const addButton = page.getByTestId("actionIcon2");

        const quantity = customerType.name == "Usaha Mikro" ? 2 : 1;

        if (customerType.name == "Usaha Mikro") {
          for (let i = 1; i < quantity; i++) {
            await addButton.click();
          }
        }

        await page.getByRole("button", { name: "CEK PESANAN" }).click();
        await sleep(200);
        await page.getByRole("button", { name: "PROSES PENJUALAN" }).click();
        await sleep(200);

        for (let x = 0; x < 3; x++) {
          await page.waitForSelector(".rc-slider-captcha-jigsaw-bg");
          const puzzleCanvas = await page.locator(".rc-slider-captcha-jigsaw-bg").boundingBox();
          const puzzleBg = (await page.locator(".rc-slider-captcha-jigsaw-bg").getAttribute("src"))?.replace(
            "data:image/jpeg;base64,",
            ""
          );

          const puzzlePiece = page.locator(".rc-slider-captcha-jigsaw-puzzle");
          // const puzzlePieceBuffer = Buffer.from(
          //   (await puzzlePiece.getAttribute("src"))?.replace("data:image/png;base64,", "")!,
          //   "base64"
          // );

          puzzlePiece.evaluate((node) => {
            node.style.filter = "brightness(0) invert(1) opacity(0.75)";
          });

          // const puzzleDominantColor = (
          //   await dominantColorFromImageBuffer(puzzlePieceBuffer, {
          //     sampleSize: 120,
          //     ignoreBelow: 16,
          //     ignoreAbove: 250,
          //     ignoreNearGray: true,
          //     grayTolerance: 10,
          //     topK: 5, // jika butuh palet
          //   })
          // ).dominant;

          const puzzleBgBuffer = Buffer.from(puzzleBg!, "base64");
          const puzzleSlider = await page.locator(".rc-slider-captcha-button").boundingBox();

          if (puzzleSlider) {
            await page.mouse.move(puzzleSlider?.x, puzzleSlider.y);
            await page.mouse.down();

            const step = 5;
            const matchLib: number[] = [];
            for (let i = 0; i < puzzleCanvas?.width!; i += step) {
              await page.mouse.move(puzzleSlider.x + i, puzzleSlider.y);
              const solve = await page.locator(".rc-slider-captcha-jigsaw").screenshot();
              const matchPercent = (await comparePixelmatchBuffers(puzzleBgBuffer, solve)).percent;
              const matchLastNum = matchLib.slice(-3);

              console.log(matchPercent);
              console.log(matchLastNum);

              if (matchLastNum.length == 3 && matchLastNum.every((v) => v == matchPercent)) {
                break;
              }

              matchLib.push(matchPercent);
            }

            const highestMatch = Math.max(...matchLib);
            await page.mouse.move(puzzleSlider.x + matchLib.indexOf(highestMatch) * step, puzzleSlider.y);
            await page.mouse.up();
          }

          await sleep(1000);
          if (page.url().startsWith("https://subsiditepatlpg.mypertamina.id/merchant/app/sale/struk")) {
            return {
              success: true,
              quantity: quantity,
              message: "Success",
              code: 200,
            };
          }
        }
      } catch (e: any) {
        console.error(e);
        await this.bot.sendPhotoToAdmin(await page.screenshot(), "[-] Error transaction: " + e.message);
        return {
          success: false,
          message: e.message,
          code: 500,
        };
      }
    }

    return {
      success: false,
      message: "Unknown Error",
      code: 500,
    };
  }

  async close() {
    (await this.browser).close();
  }
}
