import axios from "axios";

export class Pertamina {
  private linkLogin = "https://pertamina-login.vercel.app";
  private linkReport = "https://api-map.my-pertamina.id/general/v1/transactions/report";
  private linkProduct = "https://api-map.my-pertamina.id/general/v2/products";
  private linkPersonal = "https://subsiditepatlpg.mypertamina.id/merchant/app/profile-merchant";
  private linkCheckNIK = "https://api-map.my-pertamina.id/customers/v1/verify-nik?nationalityId=";
  private linkTransaction = "https://api-map.my-pertamina.id/general/v1/transactions";

  private username: string;
  private password: string;
  private options: any;

  constructor(username: string, password: string, bearer: string) {
    this.username = username;
    this.password = password;

    this.options = {
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
    };
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
        const typeNames: Array<string> = (customer.data.customerTypes as Array<Object>).map(
          (c: any) => c.name
        ) as Array<string>;

        if (typeNames.includes("Usaha Mikro")) {
          return customer.data.customerTypes[typeNames.indexOf("Usaha Mikro")];
        } else if (typeNames.includes("Rumah Tangga")) {
          return customer.data.customerTypes[typeNames.indexOf("Rumah Tangga")];
        }
      })();

      let buyQuantity = customerType.name == "Usaha Mikro" ? 3 : 1;
      if (customerType.name == "Usaha Mikro" && product.data.stockAvailable < 3)
        buyQuantity = product.data.stockAvailable;

      if (buyQuantity <= 0) {
        return {
          success: false,
          message: "Out of stock",
          code: 400,
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
    } else if (customer.code == 404) {
      return {
        success: false,
        message: "Unregistered NIK",
        code: 404,
      };
    }

    return {
      success: false,
      message: "Unknown Error",
      code: 500,
    };
  }
}
