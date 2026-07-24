import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const agentId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

const baseAgent = {
  id: agentId,
  companyId,
  name: "Builder",
  urlKey: "builder",
  role: "engineer",
  title: "Builder",
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "codex_local",
  adapterConfig: {
    env: {
      GH_PAT_TOKEN: { type: "plain", value: "ghp_supersecretvalue" },
      KLARNA_AGENTIC_TOKEN_ID: {
        type: "secret_ref",
        secretId: "33333333-3333-4333-8333-333333333333",
      },
      PAPERCLIP_API_URL: "https://api.paperclip.dev",
    },
    model: "gpt-5",
    cwd: "/tmp/agent-workdir",
    auth: {
      type: "secret_ref",
      secretId: "44444444-4444-4444-8444-444444444444",
      version: "latest",
    },
  },
  runtimeConfig: {
    access: {
      type: "secret_ref",
      secretId: "55555555-5555-4555-8555-555555555555",
      version: 2,
    },
  },
  defaultEnvironmentId: null,
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  pausedAt: null,
  permissions: { canCreateAgents: false },
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date("2026-07-03T00:00:00.000Z"),
  updatedAt: new Date("2026-07-03T00:00:00.000Z"),
};

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  getChainOfCommand: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  decide: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  listPrincipalGrants: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({}));
const mockBudgetService = vi.hoisted(() => ({}));
const mockHeartbeatService = vi.hoisted(() => ({}));
const mockIssueApprovalService = vi.hoisted(() => ({}));
const mockIssueService = vi.hoisted(() => ({}));
const mockSecretService = vi.hoisted(() => ({
  normalizeAdapterConfigForPersistence: vi.fn(),
  resolveAdapterConfigForRuntime: vi.fn(),
}));
const mockAgentInstructionsService = vi.hoisted(() => ({}));
const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockInstanceSettingsService = vi.hoisted(() => ({
  getGeneral: vi.fn(),
}));
const mockEnvironmentService = vi.hoisted(() => ({}));

function registerModuleMocks() {
  vi.doMock("@paperclipai/shared/telemetry", () => ({
    trackAgentCreated: vi.fn(),
    trackErrorHandlerCrash: vi.fn(),
  }));
  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: () => ({ track: vi.fn() }),
  }));
  vi.doMock("../services/agents.js", () => ({
    agentService: () => mockAgentService,
  }));
  vi.doMock("../services/access.js", () => ({
    accessService: () => mockAccessService,
  }));
  vi.doMock("../services/approvals.js", () => ({
    approvalService: () => mockApprovalService,
  }));
  vi.doMock("../services/company-skills.js", () => ({
    companySkillService: () => mockCompanySkillService,
  }));
  vi.doMock("../services/budgets.js", () => ({
    budgetService: () => mockBudgetService,
  }));
  vi.doMock("../services/heartbeat.js", () => ({
    heartbeatService: () => mockHeartbeatService,
  }));
  vi.doMock("../services/issue-approvals.js", () => ({
    issueApprovalService: () => mockIssueApprovalService,
  }));
  vi.doMock("../services/issues.js", () => ({
    issueService: () => mockIssueService,
  }));
  vi.doMock("../services/secrets.js", () => ({
    secretService: () => mockSecretService,
  }));
  vi.doMock("../services/environments.js", () => ({
    environmentService: () => mockEnvironmentService,
  }));
  vi.doMock("../services/agent-instructions.js", () => ({
    agentInstructionsService: () => mockAgentInstructionsService,
    syncInstructionsBundleConfigFromFilePath: (_agent: unknown, config: unknown) => config,
  }));
  vi.doMock("../services/workspace-operations.js", () => ({
    workspaceOperationService: () => mockWorkspaceOperationService,
  }));
  vi.doMock("../services/activity-log.js", () => ({
    logActivity: mockLogActivity,
  }));
  vi.doMock("../services/instance-settings.js", () => ({
    instanceSettingsService: () => mockInstanceSettingsService,
  }));
  vi.doMock("../services/index.js", () => ({
    agentService: () => mockAgentService,
    agentInstructionsService: () => mockAgentInstructionsService,
    accessService: () => mockAccessService,
    approvalService: () => mockApprovalService,
    companySkillService: () => mockCompanySkillService,
    budgetService: () => mockBudgetService,
    heartbeatService: () => mockHeartbeatService,
    ISSUE_LIST_DEFAULT_LIMIT: 500,
    issueApprovalService: () => mockIssueApprovalService,
    issueService: () => mockIssueService,
    logActivity: mockLogActivity,
    secretService: () => mockSecretService,
    workspaceOperationService: () => mockWorkspaceOperationService,
    environmentService: () => mockEnvironmentService,
  }));
}

function createDbStub() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: (resolve: (rows: unknown[]) => void) =>
            Promise.resolve(resolve([{ id: companyId, name: "Paperclip" }])),
        }),
      }),
    }),
  };
}

async function createApp(
  actor: Record<string, unknown>,
  agent: Record<string, unknown> = baseAgent,
) {
  const [{ errorHandler }, { agentRoutes }] = await Promise.all([
    import("../middleware/index.js") as Promise<typeof import("../middleware/index.js")>,
    import("../routes/agents.js") as Promise<typeof import("../routes/agents.js")>,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = { ...actor };
    next();
  });
  app.use("/api", agentRoutes(createDbStub() as unknown as Parameters<typeof agentRoutes>[0]));
  app.use(errorHandler);
  (mockAgentService.getById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(agent);
  (mockAgentService.getChainOfCommand as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  return app;
}

describe.sequential("agents/me adapterConfig.env redaction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../middleware/index.js");
    vi.doUnmock("../routes/agents.js");
    registerModuleMocks();
    mockAgentService.getById.mockReset();
    mockAgentService.list.mockReset();
    mockAgentService.getChainOfCommand.mockReset();
    mockAccessService.canUser.mockReset();
    mockAccessService.decide.mockReset();
    mockAccessService.hasPermission.mockReset();
    mockAccessService.getMembership.mockReset();
    mockAccessService.listPrincipalGrants.mockReset();
    mockCompanySkillService.listRuntimeSkillEntries.mockReset();
    mockCompanySkillService.resolveRequestedSkillKeys.mockReset();
    mockSecretService.normalizeAdapterConfigForPersistence.mockReset();
    mockSecretService.resolveAdapterConfigForRuntime.mockReset();
    mockInstanceSettingsService.getGeneral.mockReset();
    mockLogActivity.mockReset();

    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.decide.mockImplementation(async () => ({
      allowed: true,
      reason: "allow_explicit_grant",
      explanation: "Allowed by test grant",
    }));
    mockAccessService.hasPermission.mockResolvedValue(false);
    mockAccessService.getMembership.mockResolvedValue({
      id: "membership-1",
      companyId,
      principalType: "agent",
      principalId: agentId,
      status: "active",
      membershipRole: "member",
    });
    mockAccessService.listPrincipalGrants.mockResolvedValue([]);
    mockCompanySkillService.listRuntimeSkillEntries.mockResolvedValue([]);
    mockCompanySkillService.resolveRequestedSkillKeys.mockImplementation(
      async (_cid: string, requested: string[]) => requested,
    );
    mockSecretService.normalizeAdapterConfigForPersistence.mockImplementation(
      async (_cid: string, config: unknown) => config,
    );
    mockSecretService.resolveAdapterConfigForRuntime.mockImplementation(
      async (_cid: string, config: unknown) => ({ config }),
    );
    mockInstanceSettingsService.getGeneral.mockResolvedValue({ censorUsernameInLogs: false });
  });

  it("strips raw secret values from /api/agents/me adapterConfig.env", async () => {
    const app = await createApp({
      type: "agent",
      agentId,
      companyId,
      source: "agent_key",
    });

    const res = await request(app).get("/api/agents/me");

    expect(res.status).toBe(200);
    const env = res.body.adapterConfig.env as Record<string, { type?: string; present: boolean; value?: unknown }>;
    expect(env.GH_PAT_TOKEN).toEqual({
      type: "plain",
      present: true,
    });
    expect(env.GH_PAT_TOKEN).not.toHaveProperty("value");
    expect(JSON.stringify(env.GH_PAT_TOKEN)).not.toContain("ghp_supersecretvalue");

    expect(env.KLARNA_AGENTIC_TOKEN_ID).toEqual({
      type: "secret_ref",
      present: true,
    });
    expect(JSON.stringify(env.KLARNA_AGENTIC_TOKEN_ID)).not.toContain(
      "33333333-3333-4333-8333-333333333333",
    );

    expect(env.PAPERCLIP_API_URL).toEqual({ present: true });

    // Non-env fields in adapterConfig are preserved.
    expect(res.body.adapterConfig.model).toBe("gpt-5");
    expect(res.body.adapterConfig.cwd).toBe("/tmp/agent-workdir");
    expect(res.body.adapterConfig.auth).toEqual({ type: "secret_ref", present: true });
    expect(res.body.runtimeConfig.access).toEqual({ type: "secret_ref", present: true });

    const bodyJson = JSON.stringify(res.body);
    expect(bodyJson).not.toContain("44444444-4444-4444-8444-444444444444");
    expect(bodyJson).not.toContain("55555555-5555-4555-8555-555555555555");
  }, 10_000);

  it("also redacts env bindings on /api/agents/:id self-view", async () => {
    const app = await createApp({
      type: "agent",
      agentId,
      companyId,
      source: "agent_key",
    });

    const res = await request(app).get(`/api/agents/${agentId}`);

    expect(res.status).toBe(200);
    expect(res.body.adapterConfig.env).toEqual({
      GH_PAT_TOKEN: { type: "plain", present: true },
      KLARNA_AGENTIC_TOKEN_ID: {
        type: "secret_ref",
        present: true,
      },
      PAPERCLIP_API_URL: { present: true },
    });
    const envJson = JSON.stringify(res.body.adapterConfig.env);
    expect(envJson).not.toContain("ghp_supersecretvalue");
  });

  it("returns 401 when the caller is not an agent", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: false,
      companyIds: [companyId],
    });

    const res = await request(app).get("/api/agents/me");
    expect(res.status).toBe(401);
  });
});
