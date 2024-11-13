// Wrapping the whole extension in a JS function 
// (ensures all global variables set in this extension cannot be referenced outside its scope)
(async function(codioIDE, window) {
  
  // Refer to Anthropic's guide on system prompts here: https://docs.anthropic.com/claude/docs/system-prompts
  const systemPrompt = "You are a helpful assistant."
  
  // register(id: unique button id, name: name of button visible in Coach, function: function to call when button is clicked) 
  codioIDE.coachBot.register("translateContentButton", "Translate the assignment for me please!", onButtonPress)

  // function called when I have a question button is pressed
  async function onButtonPress() {
    
    // let variable_name  //const variable_name     //var variable_name
    // Let's add a chapter first for the translated content
    // let chapter_res
    // try {
    //     chapter_res = await window.codioIDE.guides.structure.add({
    //         title: 'Javascript', 
    //         type: window.codioIDE.guides.structure.ITEM_TYPES.CHAPTER
    //     })
    //     console.log('Chapter added ->', chapter_res) // returns added item: {id: '...', title: '...', type: '...', children: [...]}
    // } catch (e) {
    //     console.error(e)
    // }

    // get guides structure for page names and order
    let structure
    try {
        structure = await window.codioIDE.guides.structure.getStructure()
        console.log("This is the Guides structure", structure)
    } catch (e) {
        console.error(e)
    }

    const findPagesFilter = (obj) => {
        if (!obj || typeof obj !== 'object') return [];
        
        return [
            ...(obj.type === 'page' ? [obj] : []),
            ...Object.values(obj).flatMap(findPagesFilter)
        ];
    };

    const pages = findPagesFilter(structure)
    console.log("pages", pages)

    let guidePages = {}

    for ( const element_index in pages) {
      
      // console.log("element", element)
      let page_id = pages[element_index].id
      // console.log("page id", page_id)
      let pageData = await codioIDE.guides.structure.get(page_id)
      // console.log("pageData", pageData)
      guidePages[element_index] = {"title": pages[element_index].title, "id": page_id, "content": pageData.settings.content, "settings": pageData.settings};
    }

    console.log("guide pages", guidePages)

    // Define all variables and prompt for API calls
    const ORIGINAL_LANGUAGE = "Java"
    const NEW_LANGUAGE = "Javascript"

    const contentUserPrompt = `
    You are an AI assistant with expertise in translating instructional materials from one programming language to another. Your task is to translate the given content while maintaining the same concepts and structure, only changing the programming language-specific elements.

Here is the original content to be translated:
<original_content>
{ORIGINAL_CONTENT}
</original_content>

The original programming language is ${ORIGINAL_LANGUAGE}, and you need to translate it to ${NEW_LANGUAGE}.

Follow these guidelines for the translation:
1. Keep all the content and concepts covered in the original material the same.
2. Only modify programming language-specific elements to ensure correctness in the new language.
3. Maintain the overall structure and flow of the instructional material.
4. Adapt code examples, syntax, and language-specific terminology to the new programming language.
5. Ensure that explanations and comments are updated to reflect the new language's conventions and best practices.
6. Do not add any explanations, additional comments, or extra functionality that wasn't present in the original content.
7. If there are any portions of the code that cannot be directly translated due to language limitations, provide the closest equivalent functionality and include a comment explaining the adaptation.
8. If there is a {Try It} button command on the page, make sure the filepath in the command starts with code/ - for eg. {Try it}(node code/<filename>.js)


When handling specific elements:
- Keep all image links exactly the same.
- For code file links, keep the filename the same but update the file extension to match the new programming language.

Please provide the translated content, ensuring that it accurately reflects the original material while being correctly adapted to ${NEW_LANGUAGE}. 
Present your translation in the following format:

<translated_content>
[Your translated content goes here]
</translated_content>

Remember to maintain the educational value and clarity of the original content throughout your translation. 
It should also follow markdown formatting.
    `

    const codeFileUserPrompt = `
    You are tasked with translating a code file from one programming language to another. Your goal is to produce an accurate translation that retains all the original information without adding anything extra. 
    Follow these instructions carefully:

The original programming language is ${ORIGINAL_LANGUAGE}, and you need to translate it to ${NEW_LANGUAGE}.

Here is the code file to be translated:
<code_file>
{CODE_FILE}
</code_file>

Before translating, think through how you will translate and structure the page in a <scratchpad>
section.

Translation process:
   a. Carefully read and understand the entire code page.
   b. Identify the main components, functions, and logic of the code.
   c. Translate each component into the target language, ensuring that the functionality and logic remain identical.
   d. Maintain the original structure and organization of the code as much as possible.
   e. Preserve all comments, translating them if necessary while keeping their original meaning.
   f. Ensure that variable names, function names, and other identifiers are translated appropriately if they contain language-specific words.
   h. Adapt any language-specific idioms or constructs to their equivalent in the target language.
   i. Double-check that all syntax is correct for the target language.

Output requirements:
   a. Provide the translated code inside <translated_code> tags.
   b. Ensure the translated code is properly formatted and indented for readability.
   c. Do not add any explanations, additional comments, or extra functionality that wasn't present in the original code.
   d. If there are any portions of the code that cannot be directly translated due to language limitations, provide the closest equivalent functionality and include a comment explaining the adaptation.

Begin your translation now, and remember to focus solely on accurate translation without adding any extra information or functionality.
`
    // iterate through guidePages for translation
    for (const [pageIndex, pageData] of Object.entries(guidePages)) {
        console.log(`${pageIndex}: ${pageData.title}`)
        
        let pageContent
        let codeFile

        const pageLayout = pageData.settings.layout
        // if layout is not 1 panel, then check for open file in left panel
        if (pageLayout != "1-panel") {

            const openFilePath = pageData.settings.actions[0].fileName
            // check if open file is a .java file and not an image or anything else
            if (openFilePath.endsWith(".java")) {
                console.log("this should be the java file that's open with this page", `${pageData.settings.actions[0].fileName}`)
                // fetch file content
                codeFile = await codioIDE.files.getContent(filepath)
            }
        }

        pageContent = pageData.content

        codioIDE.coachBot.write(`Translating page on ${pageData.title} at index ${pageIndex}`)
        var updatedContentPrompt = contentUserPrompt.replace('{ORIGINAL_CONTENT}', pageContent)
        
        // function that takes in the userPrompt and extraction xml tag, returns the translation result
        async function fetchTranslation(userPrompt, xml_tag) {

            // Send the API request to the LLM with page content
            const result = await codioIDE.coachBot.ask(
                {
                    systemPrompt: systemPrompt,
                    messages: [{
                        "role": "user", 
                        "content": userPrompt
                    }]
                }, {stream:false, preventMenu: true}
            )

            // console.log("translation result", result)
            
            const startIndex = result.result.indexOf(`<${xml_tag}>`) + `<${xml_tag}>`.length
            const endIndex = result.result.lastIndexOf(`</${xml_tag}>`);

            return result.result.substring(startIndex, endIndex);
        }

        const translatedContent = await fetchTranslation(updatedContentPrompt, "translated_content")
        
        console.log("translation result", translatedContent)

        let translatedCodeFile

        if (codeFile) {
            var updatedCodeFilePrompt = codeFileUserPrompt.replace('{CODE_FILE}', codeFile)
            translatedCodeFile = await fetchTranslation(updatedCodeFilePrompt, "translated_code")
        }

        try {
            const page_res = await window.codioIDE.guides.structure.add({
                title: `${pageName}`, 
                type: window.codioIDE.guides.structure.ITEM_TYPES.PAGE,
                layout: window.codioIDE.guides.structure.LAYOUT.L_2_PANELS,
                content: `${translated_content}`,
            }, `${chapter_res.id}`, pageIndex+1)
            codioIDE.coachBot.write(`${pageName} Translation complete!! `)
            
            console.log('add item result', page_res) // returns added item: {id: '...', title: '...', type: '...', children: [...]}
        } catch (e) {
            console.error(e)
        }




        // get page content for content translation prompt

        // get file content for code translation prompt if applicable, else pass
        // get page settings and layout


        // apply them to new page with translated content and code file (if applicable) and add it to the created chapter

    }


//   e. Rate the translation on a scale of 1 to 5. (1 being poor and 5 being excellent.) in a <rating> tag
//    g. Finally, provide translation rating explanations in a <rating_explanation> tag

    codioIDE.coachBot.showMenu()
  }
// calling the function immediately by passing the required variables
})(window.codioIDE, window)

 

  
  
