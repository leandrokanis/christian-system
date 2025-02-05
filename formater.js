const axios = require('axios');
require('dotenv').config();
const path = require('path');

async function formatToMarkdown(fileContent) {
  try {
    console.log('Iniciando formatação para markdown...');
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: "Você é um assistente especializado em formatar texto para markdown."
          },
          {
            role: "system",
            content: `Não altere o conteúdo do arquivo, apenas formate para markdown.`
          },
          {
            role: "system",
            content: `O título do arquivo dever ser o primeiro nível de heading do texto, por exemplo: # 1. Título do Texto`
          },
          {
            role: "system",
            content: `Responda apenas com o texto formatado para markdown, não inclua explicações ou comentários.`
          },
          {
            role: "system",
            content: `Responda texto completo, sem abreviar, sem cortar, sem resumir, sem resumir o texto.`
          },
          {
            role: "user",
            content: `Por favor, melhore a formatação do seguinte texto para markdown:\n\n${fileContent}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Markdown Formatter'
        }
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('Resposta da API em formato inesperado:', JSON.stringify(response.data, null, 2));
      throw new Error('Resposta da API em formato inválido');
    }

    console.log('Formatação concluída com sucesso');
    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      console.error('Erro da API:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error('Erro ao formatar para markdown:', error.message);
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

async function processDirectory(singleFile = null) {
  const fs = require('fs').promises;
  
  try {
    // Se um arquivo específico foi fornecido, processa apenas ele
    if (singleFile) {
      console.log('\n🔍 Processando arquivo específico...');
      const fullPath = path.join(process.cwd(), singleFile);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          await processFile(fullPath);
          console.log('\n🎉 Processamento do arquivo concluído!');
          return;
        } else {
          console.error('❌ O caminho fornecido não é um arquivo válido');
          return;
        }
      } catch (error) {
        console.error('❌ Erro ao acessar o arquivo:', error.message);
        return;
      }
    }

    // Caso contrário, processa todos os arquivos em diretórios 'part'
    console.log('\n🔍 Iniciando busca por diretórios...');
    const items = await fs.readdir(process.cwd());
    
    // Filtra apenas os diretórios que começam com 'part'
    const partDirs = [];
    console.log('Procurando diretórios que começam com "part"...');
    for (const item of items) {
      const fullPath = path.join(process.cwd(), item);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory() && item.toLowerCase().startsWith('part')) {
          partDirs.push(item);
          console.log(`📁 Diretório encontrado: ${item}`);
        }
      } catch (error) {
        continue;
      }
    }

    console.log(`\n📂 Total de diretórios encontrados: ${partDirs.length}`);

    // Processa cada diretório
    for (const dir of partDirs) {
      const fullDirPath = path.join(process.cwd(), dir);
      console.log(`\n🔄 Processando diretório: ${dir}`);
      const files = await fs.readdir(fullDirPath);
      
      console.log(`Encontrados ${files.length} arquivos em ${dir}`);
      
      // Processa cada arquivo no diretório
      for (const file of files) {
        const filePath = path.join(fullDirPath, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            await processFile(filePath);
          }
        } catch (error) {
          console.error(`❌ Erro ao processar arquivo ${file}:`, error.message);
          continue;
        }
      }
      console.log(`✅ Diretório ${dir} processado`);
    }
    
    console.log('\n🎉 Processamento de todos os diretórios concluído com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro ao processar:', error.message);
  }
}

// Executa com base nos argumentos da linha de comando
if (require.main === module) {
  const singleFile = process.argv[2];
  processDirectory(singleFile);
}

module.exports = { formatToMarkdown, processFile };
