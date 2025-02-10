import { Bot, InputFile } from "grammy";

export class Telegram {
  private adminID: string = process.env.ADMIN_ID as string;
  private botToken: string = process.env.BOT_TOKEN as string;
  bot = new Bot(this.botToken);

  async sendToAdmin(message: string) {
    await this.bot.api.sendMessage(this.adminID, message, {
      parse_mode: "HTML",
    });
  }

  async sendRawToAdmin(message: string) {
    await this.bot.api.sendMessage(this.adminID, message);
  }

  async sendCredToAdmin() {
    await this.bot.api.sendDocument(this.adminID, new InputFile(".env"));
  }

  async sendPhotoToAdmin(buffer: Buffer, caption: string) {
    await this.bot.api.sendPhoto(this.adminID, new InputFile(buffer), {
      caption: caption,
    });
  }
}
