// Resonate HQ
import { Resonate } from "@resonatehq/gcp";
import { research } from "./agent";

const resonate = new Resonate();

resonate.register("research", research);

export const handler = resonate.handlerHttp();
