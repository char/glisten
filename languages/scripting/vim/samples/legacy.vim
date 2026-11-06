" A small legacy plugin
fu! s:Welcome(name)
  let l:message = "Hello, " . a:name " trailing comment
  if &l:number ==# 1
    echo l:message "again"
  else
    echo 'It''s quiet'
  endif
  retu l:message
endf

let g:items = [
      "\ first item
      \ 'one',
      \ "two",
      \ ]
nnoremap <Leader>w :call <SID>Welcome('world')<CR>
exe 'echo "generated command"'
let $PROJECT_HOME = '/tmp'
setlocal path=one\ two,three\"four " option comment
syntax keyword Demo contained ALPHA BETA
syntax match Demo /"quoted"/ contained
syntax region Quoted start=+"+ skip=+\\"+ end=+"+
syntax sync match Demo grouphere NONE /"sync"/
highlight default link Demo Comment " highlight comment
normal! i"literal | normal text
vim9cmd var greeting = "vim9 string" # vim9 comment
let g:again = "legacy string" " legacy comment
