// Все запросы мини-приложения: Telegram.WebApp.Serverless.call('app', { op, ... }).
import { handleApp } from '../lib/webapp.js';

export default async function (input, ctx) {
  return handleApp(input, ctx);
}
