#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const required = (name) => {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) throw new Error(`Missing Fly organization comparison: ${name}.`);
    return value;
};
const staging = required("FLY_ORG");
const production = required("ROSS_PRODUCTION_FLY_ORG");
const payload = JSON.parse(execFileSync("flyctl", ["orgs", "list", "--json"], { encoding: "utf8" }));
const strings = [];
const walk = (value) => {
    if (typeof value === "string") strings.push(value.toLowerCase());
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
};
walk(payload);
if (!strings.includes(staging)) throw new Error(`Staging Fly token cannot access required organization ${staging}.`);
if (strings.includes(production)) throw new Error(`Staging Fly token unexpectedly has authority over production organization ${production}.`);
console.log(`PASS: Fly token is limited to staging organization ${staging}.`);
