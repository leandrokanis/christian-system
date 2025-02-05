const getConfig = require("vuepress-bar");

const { nav, sidebar } = getConfig();

module.exports = {
  themeConfig: {
    nav,
    sidebar: sidebar.filter((i) => i.title !== "Node Modules"),
  },
  configureWebpack: {
    optimization: {
      minimize: false
    }
  }
};