import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import { VariableResolver } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";
import { z } from "zod";
import * as fs from "fs";
import { parse as parseCsv } from "csv-parse/sync";
import * as xlsx from "xlsx";
import { logger } from "@ghost/observability";

// --- Exposed Schemas ---
export const DataInputSchema = z.object({
  operation: z.enum(["TRANSFORM", "MATCH", "PROCESS_FILE", "SET_VARIABLE"]),
  args: z.any()
});

export const DataResultSchema = z.object({
  result: z.any()
});

export const DataErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});

export class DataExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "DATA";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const resolver = new VariableResolver(context);
    
    // Schema validation for operation
    const inputParse = DataInputSchema.safeParse({ operation: step.operation, args: step.args });
    if (!inputParse.success) {
      return { state: "FAILED", message: `Invalid DATA operation: ${inputParse.error.message}` };
    }

    try {
      if (step.operation === "TRANSFORM") {
        const { formula, variables } = step.args || {};
        if (!formula) throw new Error("TRANSFORM requires a formula");
        
        const resolvedVars = resolver.resolve(variables || {});
        
        let result: any;
        if (typeof formula === "object") {
          result = this.evaluateAST(formula, resolvedVars);
        } else {
          result = resolver.resolve(formula);
        }
        
        logger.info({ stepId: step.id, operation: "TRANSFORM" }, "Data transformed successfully");
        return {
          state: "SUCCEEDED",
          outputs: step.bind_result_to ? { [step.bind_result_to]: result } : {}
        };
      }

      if (step.operation === "MATCH") {
        const { value, target, strategy = "EXACT" } = step.args || {};
        const val = resolver.resolve(value);
        const tgt = resolver.resolve(target);
        
        let matched = false;
        const mappings = context.get("mappings") || {};
        if (mappings[val] === tgt) {
          matched = true;
        }
        
        if (!matched) {
          if (strategy === "EXACT") matched = (val === tgt);
          else if (strategy === "CASE_INSENSITIVE") matched = (String(val).toLowerCase() === String(tgt).toLowerCase());
        }
        
        if (!matched) {
          logger.warn({ stepId: step.id, val, tgt }, "Data match failed");
          return {
            state: step.failure_policy?.on_failure === "PAUSE_FOR_HUMAN" ? "PAUSED_FOR_HUMAN" : "FAILED",
            hitlReason: "UNMATCHED_ENTITY",
            message: `Match failed: ${val} != ${tgt}`
          };
        }
        
        logger.info({ stepId: step.id }, "Data match succeeded");
        return { state: "SUCCEEDED" };
      }
      
      if (step.operation === "PROCESS_FILE") {
        const { file } = step.args || {};
        const resolvedFile = resolver.resolve(file);
        
        if (!resolvedFile || typeof resolvedFile !== "string") {
          throw new Error("PROCESS_FILE requires a valid file path string");
        }

        if (!fs.existsSync(resolvedFile)) {
          throw new Error(`File not found: ${resolvedFile}`);
        }

        let output: any = [];
        const lowerFile = resolvedFile.toLowerCase();

        if (lowerFile.endsWith(".csv")) {
          const fileContent = fs.readFileSync(resolvedFile, "utf-8");
          output = parseCsv(fileContent, { columns: true, skip_empty_lines: true });
        } else if (lowerFile.endsWith(".xlsx") || lowerFile.endsWith(".xls")) {
          const workbook = xlsx.readFile(resolvedFile);
          const firstSheetName = workbook.SheetNames[0];
          if (firstSheetName) {
            const worksheet = workbook.Sheets[firstSheetName];
            output = xlsx.utils.sheet_to_json(worksheet!);
          }
        } else if (lowerFile.endsWith(".json")) {
          const fileContent = fs.readFileSync(resolvedFile, "utf-8");
          output = JSON.parse(fileContent);
        } else {
          throw new Error(`Unsupported file type for processing: ${resolvedFile}`);
        }
        
        const expectedSchema = step.args?.expectedSchema;
        if (expectedSchema && Array.isArray(expectedSchema) && output.length > 0) {
          const firstRowKeys = Object.keys(output[0]);
          const missingKeys = expectedSchema.filter(k => !firstRowKeys.includes(k));
          if (missingKeys.length > 0) {
             logger.error({ stepId: step.id, missingKeys }, "Data schema validation failed");
             return { state: "FAILED", message: `Schema violation: Missing required columns: ${missingKeys.join(", ")}` };
          }
        }
        
        logger.info({ stepId: step.id, records: output.length }, "File processed successfully");

        return {
          state: "SUCCEEDED",
          outputs: step.bind_result_to ? { [step.bind_result_to]: output } : {}
        };
      }
      
      if (step.operation === "SET_VARIABLE") {
        const { value } = step.args || {};
        const resolved = resolver.resolve(value);
        return {
          state: "SUCCEEDED",
          outputs: step.bind_result_to ? { [step.bind_result_to]: resolved } : {}
        };
      }

      return { state: "FAILED", message: `Unsupported DATA operation: ${step.operation}` };
    } catch (err: any) {
      if (err.name === "MissingVariableError") throw err;
      logger.error({ stepId: step.id, error: err.message }, "Data execution failed");
      return { state: "FAILED", message: err.message };
    }
  }

  private evaluateAST(ast: any, vars: any): any {
    if (ast.op === "SUBTRACT") {
      const left = ast.left.type === "VAR" ? vars[ast.left.name] : ast.left.value;
      const right = ast.right.type === "VAR" ? vars[ast.right.name] : ast.right.value;
      return Number(left) - Number(right);
    }
    if (ast.op === "ADD") {
      const left = ast.left.type === "VAR" ? vars[ast.left.name] : ast.left.value;
      const right = ast.right.type === "VAR" ? vars[ast.right.name] : ast.right.value;
      return Number(left) + Number(right);
    }
    if (ast.op === "MULTIPLY") {
      const left = ast.left.type === "VAR" ? vars[ast.left.name] : ast.left.value;
      const right = ast.right.type === "VAR" ? vars[ast.right.name] : ast.right.value;
      return Number(left) * Number(right);
    }
    if (ast.op === "DIVIDE") {
      const left = ast.left.type === "VAR" ? vars[ast.left.name] : ast.left.value;
      const right = ast.right.type === "VAR" ? vars[ast.right.name] : ast.right.value;
      if (Number(right) === 0) throw new Error("Division by zero");
      return Number(left) / Number(right);
    }
    if (ast.op === "SUM") {
      const items = ast.items.type === "VAR" ? vars[ast.items.name] : ast.items.value;
      if (!Array.isArray(items)) throw new Error("SUM expects an array");
      const field = ast.field;
      return items.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
    }
    throw new Error(`Unsupported AST operation: ${ast.op}`);
  }
}
