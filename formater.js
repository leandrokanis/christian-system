const axios = require('axios');
require('dotenv').config();

async function formatToMarkdown(fileContent) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "anthropic/claude-3-opus-20240229",
        messages: [
          {
            role: "system",
            content: "Você é um assistente especializado em formatar texto para markdown."
          },
          {
            role: "user",
            content: `Por favor, melhore a formatação do seguinte texto para markdown, responda apenas com o texto formatado:\n\n${fileContent}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000', // Substitua pelo seu domínio
          'X-Title': 'Markdown Formatter'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao formatar para markdown:', error);
    throw error;
  }
}

async function processFile(filePath) {
  const fs = require('fs').promises;
  
  try {
    // Lê o arquivo
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Formata o conteúdo
    const markdownContent = await formatToMarkdown(fileContent);
    
    // Salva o conteúdo formatado no arquivo original
    await fs.writeFile(filePath, markdownContent);
    
    console.log(`Arquivo formatado com sucesso: ${filePath}`);
  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
  }
}

// Exemplo de uso
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Por favor, forneça o caminho do arquivo como argumento.');
    process.exit(1);
  }
  processFile(filePath);
}

module.exports = { formatToMarkdown, processFile };
