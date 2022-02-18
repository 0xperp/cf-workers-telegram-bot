import TelegramBot from "./telegram_bot";
import { JSONResponse, sha256, getBaseURL } from "./libs";

export default class Handler {
  configs: any;
  tokens: [string];
  response: Response;
  access_keys: string[];
  bot_id: number;
  request: any;
  bot: TelegramBot;
  url: string;

  constructor(configs) {
    this.configs = configs;
    this.tokens = this.configs.map((item) => item.token);
    this.response = new Response();
  }

  // handles the request
  handle = async (request) => {
    const url = new URL(request.url);
    const url_key = url.pathname.substring(1).replace(/\/$/, "");
    const worker_url = getBaseURL(request.url);

    this.access_keys = await Promise.all(
      this.tokens.map(async (token) => await sha256(token))
    );
    this.bot_id = this.access_keys.indexOf(url_key);

    if (this.bot_id > -1) {
      this.request = await this.processRequest(request);

      this.bot = new TelegramBot({
        token: this.tokens[this.bot_id.toString()], // Bot Token
        access_key: this.access_keys[this.bot_id.toString()], // Access Key
        commands: this.configs[this.bot_id.toString()].commands, // Bot commands
        url: worker_url, // worker url
      });

      if (this.request.method === "POST" && this.request.size > 6) {
        this.response = await this.bot.update(this.request);
      } else if (this.request.method === "GET") {
        this.response = await this.bot.webhook.process(url);
        await this.bot.webhook.set();
      } else {
        this.response = this.error(this.request.content.error);
      }
    } else {
      this.response = this.error("Invalid access key");
    }

    // Log access keys to console if access key is not acceptable
    for (const id in this.access_keys)
      console.log(
        this.configs[id].bot_name,
        "Access Link:",
        worker_url + this.access_keys[id]
      );

    return this.response;
  };

  processRequest = async (req) => {
    req.size = parseInt(req.headers["content-length"]) || 0;
    req.type = req.headers["content-type"] || "";
    if (req.cf) req.content = await this.getContent(req);
    else if (req.method == "GET")
      req.content = {
        message: "Accessing webhook",
      };
    else
      req.content = {
        message: "",
        error: "Invalid content type or body",
      };
    return req;
  };

  getContent = async (request) => {
    if (request.type.includes("application/json")) {
      return request.json;
    } else if (request.type.includes("text/")) {
      return request.text;
    } else if (request.type.includes("form")) {
      const formData = request.formData;
      const body = {};
      for (const entry of formData.entries()) {
        body[entry[0]] = entry[1];
      }
      return body;
    } else {
      return request.arrayBuffer;
    }
  };

  // handles error responses
  error = (message, status = 403) =>
    JSONResponse(
      {
        error: message,
      },
      status
    );
}