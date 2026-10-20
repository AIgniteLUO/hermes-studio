import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const readClientFile = (path: string) =>
  readFileSync(`packages/client/src/${path}`, "utf8");

describe("Hermes configuration navigation", () => {
  it("moves Hermes-only pages into the dedicated sidebar", () => {
    const app = readClientFile("App.vue");
    const appSidebar = readClientFile("components/layout/AppSidebar.vue");
    const configSidebar = readClientFile(
      "components/layout/HermesConfigSidebar.vue",
    );
    const sharedSidebarStyles = readClientFile("styles/_agent-config-sidebar.scss");
    const router = readClientFile("router/index.ts");

    expect(app).toContain("@/components/layout/HermesConfigSidebar.vue");
    expect(app).toContain("route.meta?.hermesConfig === true");
    expect(app).toContain('v-if="!isLoginPage && usesHermesConfigSidebar"');
    expect(app).toContain("if (usesHermesConfigSidebar.value)");
    expect(app).toContain("return appStore.sidebarCollapsed ? 84 : 260");

    for (const name of [
      "hermes.jobs",
      "hermes.kanban",
      "hermes.channels",
      "hermes.skills",
      "hermes.plugins",
      "hermes.mcp",
      "hermes.memory",
      "hermes.journey",
    ]) {
      expect(configSidebar).toContain(`name: '${name}'`);
    }
    // Hermes 设置已并回系统设置页,配置侧栏不再持有设置入口。
    expect(configSidebar).not.toContain("hermes.configSettings");
    expect(configSidebar).toContain("name: 'hermes.chat'");
    expect(configSidebar).toContain('t("sidebar.backToChat")');
    expect(configSidebar).not.toContain("ProfileSelector");
    expect(configSidebar).not.toContain("ModelSelector");
    expect(configSidebar).not.toContain("hermes-config-header");
    expect(configSidebar).toContain('class="hermes-config-collapse"');
    expect(configSidebar).toContain("appStore.toggleSidebarCollapsed()");
    expect(configSidebar).toContain("collapsed: appStore.sidebarCollapsed");
    expect(configSidebar).toContain('@include agent-config-sidebar.layout("hermes")');
    // 设置入口只剩主侧栏齿轮:配置侧栏不再有第二颗齿轮。
    const mainGearPath = "M19.4 15a1.65 1.65 0 0 0 .33 1.82";
    expect(appSidebar).toContain(mainGearPath);
    expect(configSidebar).not.toContain(mainGearPath);
    expect(sharedSidebarStyles).toContain("padding: 8px 12px 20px");
    expect(sharedSidebarStyles).toContain("font-size: 14px");
    expect(sharedSidebarStyles).toContain("width: 28px");
    expect(sharedSidebarStyles).toContain("padding: 8px 8px 12px");

    for (const label of [
      "sidebar.kanban",
      "sidebar.channels",
      "sidebar.skills",
      "sidebar.plugins",
      "sidebar.mcp",
      "sidebar.memory",
      "sidebar.journey",
    ]) {
      expect(appSidebar).not.toContain(`t(\"${label}\")`);
    }
    expect(appSidebar).not.toContain("<span>Hermes</span>");
    expect(appSidebar).not.toContain("nav-group-label");
    expect(appSidebar).not.toContain("groupLabel(");
    // The pet catalog entry was removed from the sidebar.
    expect(appSidebar).not.toContain('t("sidebar.petdex")');
    expect(appSidebar).not.toContain('t("sidebar.versionPreview")');
    expect(router).toContain("path: '/hermes/config/settings'");
    // 旧的 Hermes 设置页已合并,该路径保留为带 query 的重定向。
    expect(router).toContain("name: 'hermes.configSettings'");
    expect(router.match(/meta: \{ hermesConfig: true \}/g)).toHaveLength(8);
  });

  it("merges the Hermes setting tabs back into the Studio settings page", () => {
    const settingsView = readClientFile("views/hermes/SettingsView.vue");
    const router = readClientFile("router/index.ts");

    for (const tab of ["agent", "memory", "session"]) {
      expect(settingsView).toContain(`name="${tab}" :tab="t('settings.tabs.${tab}')"`);
    }
    expect(settingsView).toContain("<AgentSettings />");
    expect(settingsView).toContain("<GatewayAutoStartSettings />");
    expect(settingsView).toContain("<MemorySettings />");
    expect(settingsView).toContain("<SessionSettings />");
    expect(settingsView).toContain("await settingsStore.fetchSettings()");
    // 旧链接别名 `gateway` 落到 agent tab,不再跨页重定向。
    expect(settingsView).toContain('if (tab === "gateway")');
    expect(settingsView).not.toContain("hermes.configSettings");

    expect(router).not.toContain("HermesSettingsView.vue");
  });
});
