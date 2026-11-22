import app from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startReconciler } from "./modules/payments/reconciler.js";

const PORT = config.PORT;

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT} in ${config.NODE_ENV} mode`);
  logger.info(`Payments mode: ${config.PAYMENTS_MODE}`);
  startReconciler();
  logger.info(`API Base URL: http://localhost:${PORT}/api/${config.API_VERSION}`);
});
