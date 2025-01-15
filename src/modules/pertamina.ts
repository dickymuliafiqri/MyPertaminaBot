import axios from "axios";
import { Browser } from "puppeteer";

export class Pertamina {
  private linkLogin = "https://pertamina-login.vercel.app";
  private linkReport = "https://api-map.my-pertamina.id/general/v1/transactions/report";
  private linkProduct = "https://api-map.my-pertamina.id/general/v2/products";
  private linkPersonal = "https://subsiditepatlpg.mypertamina.id/merchant/app/profile-merchant";
  private linkCheckNIK = "https://api-map.my-pertamina.id/customers/v1/verify-nik?nationalityId=";
  private linkTransaction = "https://api-map.my-pertamina.id/general/v1/transactions";

  private username: string;
  private password: string;
  private bearer: string;
  private options: any;

  constructor(username: string, password: string, bearer: string) {
    this.username = username;
    this.password = password;
    this.bearer = bearer;

    this.options = {
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
    };
  }

  async login(browser: Browser) {
    let message = "Login Failed";

    function sleep(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    console.log(`[+] Login using ${this.username}...`);

    const page = await browser.newPage();

    page.on("request", async (request) => {
      const bearer = request.headers()["authorization"];
      if (bearer?.length >= 800) {
        message = bearer;
      }
    });

    await page.goto("https://subsiditepatlpg.mypertamina.id/merchant/auth/login");

    await page.setViewport({ width: 1080, height: 1024 });

    await page.type("#mantine-r0", this.username);
    await page.type("#mantine-r1", this.password);

    await sleep(2000);
    await page.click(
      "#__next > div.mantine-Container-root.styles_root__3v9Qa.mantine-ceqycu > div.styles_LoginForm__QiuBs > form > div.styles_btnLogin__wsKTT > button"
    );

    for (let i = 0; i < 300; i++) {
      if (message.length > 800) break;
      await sleep(10);
    }

    await browser.close();

    this.options = {
      headers: {
        Authorization: message,
        "Content-Type": "application/json",
      },
    };

    return message;
  }

  async checkToken() {
    try {
      const req = await axios.get(this.linkProduct, {
        ...this.options,
      });

      if (req.status == 200) {
        return true;
      }
    } catch (e: any) {
      console.log(`[-] Token Expired!`);
    }

    return false;
  }

  async checkStock() {
    try {
      const req = await axios.get(this.linkProduct, {
        ...this.options,
      });

      if (req.status == 200) {
        return req.data.data.stockAvailable;
      }
    } catch (e: any) {
      console.log(`[-] Error getting stock!`);
    }

    return 0;
  }

  async getCustomer(nik: string) {
    try {
      const req = await axios.get(this.linkCheckNIK + nik, {
        ...this.options,
      });
      return req.data;
    } catch (e: any) {
      return e.response.data;
    }
  }

  async getProduct() {
    try {
      const req = await axios.get(this.linkProduct, {
        ...this.options,
      });

      if (req.status == 200) {
        return req.data;
      }
    } catch (e: any) {
      return e.response.data;
    }
  }

  async transaction(nik: string) {
    const product = await this.getProduct();
    const customer = await this.getCustomer(nik);

    if (product.success && customer.success) {
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

      let buyQuantity = customerType.name == "Usaha Mikro" ? 2 : 1;
      if (customerType.name == "Usaha Mikro" && product.data.stockAvailable < 2)
        buyQuantity = product.data.stockAvailable;

      if (buyQuantity <= 0) {
        return {
          success: false,
          message: "Out of stock",
          code: 204,
        };
      }

      const payload = {
        products: [
          {
            productId: product.data.productId,
            quantity: buyQuantity,
          },
        ],
        geoTagging: "",
        inputNominal: buyQuantity * product.data.price,
        change: 0,
        paymentType: "cash",
        subsidi: {
          nik: nik,
          IDValidation: "",
          familyId: customer.data.familyId,
          category: customerType.name,
          sourceTypeId: customerType.sourceTypeId,
          nama: customer.data.name,
          noHandPhoneKPM: customer.data.phoneNumber,
          channelInject: customer.data.channelInject,
          pengambilanItemSubsidi: [
            {
              item: "ELPIJI",
              quantitas: buyQuantity,
              potongan_harga: 0,
            },
          ],
        },
      };

      try {
        const req = await axios.post(this.linkTransaction, payload, {
          ...this.options,
        });

        return {
          ...req.data,
          payload: {
            ...payload,
          },
        };
      } catch (e: any) {
        return {
          ...e.response.data,
          payload: {
            ...payload,
          },
        };
      }
    } else if (!customer.success) {
      return customer;
    } else if (!product.success) {
      return product;
    }

    return {
      success: false,
      message: "Unknown Error",
      code: 500,
    };
  }
}
