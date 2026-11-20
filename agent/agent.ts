import { defineAgent } from "eve";

export default defineAgent({
  model: "mistral/codestral",
  modelOptions: {
    providerOptions: {
      gateway: { zeroDataRetention: true },
    },
  },
});
