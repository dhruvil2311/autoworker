import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { OrganizationalContext } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function inferOrganizationalContext(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): OrganizationalContext {
  const textCorpus = [
    understanding.goal.description,
    ...understanding.rules.map(r => r.description),
    ...graph.nodes.map(n => n.name)
  ].join(" ").toLowerCase();

  let rolesInvolved = ["Operator"];
  let departments = ["Operations"];
  let authorityLevel: "LOW" | "MEDIUM" | "HIGH" | "EXECUTIVE" = "LOW";

  if (textCorpus.includes("manager") || textCorpus.includes("approve")) {
    rolesInvolved.push("Manager");
    authorityLevel = "MEDIUM";
  }

  if (textCorpus.includes("finance")) {
    departments.push("Finance");
    authorityLevel = "HIGH";
  }

  if (textCorpus.includes("vp") || textCorpus.includes("director")) {
    rolesInvolved.push("Executive");
    authorityLevel = "EXECUTIVE";
  }

  const evidenceIds = understanding.goal.evidenceIds;

  return {
    description: `Organizational Context: ${departments.join(", ")}`,
    rolesInvolved,
    departments,
    approvalChains: authorityLevel === "LOW" ? [] : ["Operator -> Manager"],
    authorityLevel,
    evidenceIds,
    confidence: 0.7,
    selfCriticism: generateSelfCriticism(`Organizational Context: ${departments.join(", ")}`, evidenceIds)
  };
}
