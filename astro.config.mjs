import {defineConfig} from 'astro/config';
export default defineConfig({
 site:'https://tyrtyshnyy.github.io',
 base:process.env.GITHUB_ACTIONS==='true'?'/todo-hermes-ai/':'/',
 devToolbar:{enabled:false},
});
