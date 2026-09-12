import rehypeShiki from "@shikijs/rehype";
import { defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    rehypePlugins: [
      [
        rehypeShiki,
        {
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
        },
      ],
    ],
  },
});
