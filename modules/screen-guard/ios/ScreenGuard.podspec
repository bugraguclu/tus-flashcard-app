Pod::Spec.new do |s|
  s.name           = 'ScreenGuard'
  s.version        = '1.0.0'
  s.summary        = 'Blocks screen capture of paid catalog content.'
  s.description    = 'Expo module that hides protected screens from screenshots, screen recording and the app switcher.'
  s.license        = { :type => 'MIT' }
  s.author         = 'TusAnkiM'
  s.homepage       = 'https://tusankim.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
