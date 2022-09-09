// Modify from: https://gitea.tforgione.fr/tforgione/md2pdf
// LICENSE: MIT Thomas Forgione

use std::{fs::File, io::{Read, Write}};
use pulldown_cmark::{Event, Parser, Tag};

pub const LATEX_HEADER: &str = 
r#"\documentclass{article}
\begin{document}
"#;

pub const LATEX_FOOTER: &str = "\n\\end{document}\n";

pub fn markdown_to_latex(markdown: String) -> String {
    let mut output = String::from(LATEX_HEADER);

    let parser = Parser::new(&markdown);

    for event in parser {
        match event {
            Event::Start(Tag::Heading(level, _, _)) => {
                output.push_str("\\");
                for _ in 1 .. level {
                    output.push_str("sub");
                }
                output.push_str("section{");
            },
            Event::End(Tag::Heading(_,_,_)) => output.push_str("}\n"),

            Event::Start(Tag::Emphasis) => output.push_str("\\emph{"),
            Event::End(Tag::Emphasis) => output.push_str("}"),

            Event::Start(Tag::Strong) => output.push_str("\\textbf{"),
            Event::End(Tag::Strong) => output.push_str("}"),

            Event::Start(Tag::List(None)) => output.push_str("\\begin{itemize}\n"),
            Event::End(Tag::List(None)) => output.push_str("\\end{itemize}\n"),

            Event::Start(Tag::List(Some(_))) => output.push_str("\\begin{enumerate}\n"),
            Event::End(Tag::List(Some(_))) => output.push_str("\\end{enumerate}\n"),

            Event::Start(Tag::Link(_, url, _)) => {
                output.push_str("\\href{");
                output.push_str(&*url);
                output.push_str("}{");
            },

            Event::End(Tag::Link(_, _, _)) => {
                output.push_str("}");
            },

            Event::Start(Tag::Image(_, path, title)) => {
                output.push_str("\\begin{figure}\n");
                output.push_str("\\centering\n");
                output.push_str("\\includegraphics[width=\\textwidth]{");
                output.push_str(&*path);
                output.push_str("}\n");
                output.push_str("\\caption{");
                output.push_str(&*title);
                output.push_str("}\n\\end{figure}\n");
            },

            Event::Start(Tag::Item) => output.push_str("\\item "),
            Event::End(Tag::Item) => output.push_str("\n"),

            Event::Start(Tag::CodeBlock(lang)) => {
                if ! lang.is_empty() {
                    output.push_str("\\begin{lstlisting}[language=");
                    output.push_str(&*lang);
                    output.push_str("]\n");
                } else {
                    output.push_str("\\begin{lstlisting}\n");
                }
            },

            Event::End(Tag::CodeBlock(_)) => {
                output.push_str("\n\\end{lstlisting}\n");
            },

            Event::Text(t) => {
                output.push_str(&*t);
            },

            Event::SoftBreak => {
                output.push('\n');
            },

            _ => (),
        }
    }

    output.push_str(LATEX_FOOTER);

    output
}

// pub fn markdown_to_pdf(markdown: String) -> Result<Vec<u8>, tectonic::Error> {
//     tectonic::latex_to_pdf(markdown_to_latex(markdown))
// }

#[tauri::command]
pub fn write_to_pdf(md_path: String, pdf_path: String) -> bool {
  let mut markdown = String::new();
  let mut md_file = File::open(md_path).unwrap();
  md_file.read_to_string(&mut markdown).unwrap();
  println!("markdown: {}", markdown);

  let mut output = File::create(pdf_path).unwrap();
  let tex = markdown_to_latex(markdown);
  println!("tex: {}", tex);

  let data = tectonic::latex_to_pdf(tex).unwrap();
  output.write(&data).unwrap();

  return true;
}
