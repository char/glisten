" Comment at command position
let g:value = "string with \"quote\"" " trailing
if g:value !=# "x" | echo "yes" "another" | " comment
endif
let s:dict = #{item: 'value', fn: {a -> a + 1}}
let s:lambda = (a) => a + 1
let s:option = &l:tabstop + @a + $COUNT
let s:lines =<< trim END
  literal "text" and # signs
END
let after = 'done'
map <F2> :echo "literal mapping text"<CR> | " comment
  let indented =<< trim STOP
    first line
 STOP
  STOP
let untrimmed =<< END
 END
END
let after_heredocs = 'done'
