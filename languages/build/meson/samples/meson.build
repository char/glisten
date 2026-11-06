project('starlight', 'c', version: '1.2.0')

cc = meson.get_compiler('c')
threads = dependency('threads', required: true)
sources = ['main.c', 'sky.c']
config = {'prefix': get_option('prefix'), 'debug': false}

if cc.has_header('stdio.h') and not get_option('minimal')
  executable('starlight', sources, dependencies: threads, install: true)
elif host_machine.system() == 'windows'
  subdir('windows')
else
  message('No executable')
endif

foreach name : ['one', 'two']
  message(f'Building @name@')
endforeach
