const getConfig = require("vuepress-bar");

const { nav, sidebar } = getConfig();

module.exports = {
  locales: {
    '/': {
      lang: 'en-US',
      title: 'The Christian System',
      description: 'A work by Alexander Campbell'
    },
    '/pt-BR/': {
      lang: 'pt-BR',
      title: 'O Sistema Cristão',
      description: 'Uma obra de Alexander Campbell'
    }
  },
  themeConfig: {
    locales: {
      '/': {
        selectText: 'Languages',
        label: 'English',
        nav,
        sidebar: sidebar.filter((i) => i.title !== "Node Modules")
      },
      '/pt-BR/': {
        selectText: 'Idiomas',
        label: 'Português',
        nav,
        sidebar: sidebar.filter((i) => i.title !== "Node Modules")
      }
    }
  },
  configureWebpack: {
    optimization: {
      minimize: false
    }
  }
};