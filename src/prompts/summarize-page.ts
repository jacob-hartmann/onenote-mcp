/**
 * summarize-page Prompt
 *
 * Summarize the content of a specific OneNote page.
 * Fetches the page content and generates a structured summary.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphPage } from "../onenote/graph-types.js";

export function registerSummarizePage(server: McpServer): void {
  server.registerPrompt(
    "summarize-page",
    {
      title: "Summarize Page",
      description:
        "Summarize the content of a specific OneNote page. Fetches the page content and generates a structured summary.",
      argsSchema: {
        pageId: z.string().describe("The ID of the OneNote page to summarize"),
      },
    },
    async ({ pageId }, extra) => {
      let client;
      try {
        client = await getOneNoteClientOrThrow(extra);
      } catch {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: "Error: Unable to authenticate with OneNote. Please ensure your access token is valid and try again.",
              },
            },
          ],
        };
      }

      const encodedPageId = encodeURIComponent(pageId);

      const metadataResult = await client.request<GraphPage>({
        path: `/me/onenote/pages/${encodedPageId}`,
        params: { $expand: "parentSection" },
      });

      const contentResult = await client.requestRaw({
        path: `/me/onenote/pages/${encodedPageId}/content`,
      });

      if (!metadataResult.success || !contentResult.success) {
        let failedPart: string;
        if (!metadataResult.success) {
          failedPart = `metadata: ${metadataResult.error.message}`;
        } else if (!contentResult.success) {
          failedPart = `content: ${contentResult.error.message}`;
        } else {
          failedPart = "unknown";
        }
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Error: Could not fetch the OneNote page (ID: ${pageId}).

Failed to retrieve ${failedPart}

Possible causes:
- The page ID may be incorrect or the page may have been deleted.
- You may not have permission to access this page.
- The OneNote API may be temporarily unavailable.

What you can do:
- Use the list-pages tool with a sectionId to find valid page IDs.
- Verify that your account has access to the notebook containing this page.
- If the issue persists, try again in a few moments.`,
              },
            },
          ],
        };
      }

      const pageTitle = metadataResult.data.title;
      const sectionName =
        metadataResult.data.parentSection?.displayName ?? "Unknown section";
      const lastModified = metadataResult.data.lastModifiedDateTime;
      const htmlContent = contentResult.data;

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Please summarize the following OneNote page.

Page title: ${pageTitle}
Section: ${sectionName}
Last modified: ${lastModified}

Page content (HTML):
${htmlContent}

Provide:
1. A concise summary (2-3 sentences)
2. Key points or topics covered
3. Any action items or follow-ups mentioned
4. Notable dates, names, or references`,
            },
          },
        ],
      };
    }
  );
}
