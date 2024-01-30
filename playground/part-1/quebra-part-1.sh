#!/bin/bash

# Define o arquivo de entrada
input_file="part_1.md"

# Lê o arquivo de entrada e separa em arquivos menores
while IFS= read -r line; do
    if [[ $line =~ ^[0-9]+\.[[:space:]] ]]; then
        # Extrai o número do subtítulo e o título
        subtitle_number=$(echo "$line" | cut -d '.' -f 1)
        subtitle_title=$(echo "$line" | cut -d '.' -f 2-)

        # Remove espaços em branco do título para formar o nome do arquivo
        filename=$(echo "$subtitle_title" | tr -d '[:space:]').md

        # Cria um novo arquivo com o título do subtítulo
        echo "$line" > "$filename"

        # Adiciona o conteúdo do subtítulo ao arquivo
        echo "$line" >> "$filename"

    else
        # Adiciona o conteúdo do subtítulo ao arquivo atual
        echo "$line" >> "$filename"
    fi
done < "$input_file"
