import type { Preview } from "@storybook/react-vite";
import React, { useEffect } from "react";
import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => {
      useEffect(() => {
        document.documentElement.setAttribute("data-theme", "light");
      }, []);
      return React.createElement(Story);
    },
  ],
};

export default preview;
