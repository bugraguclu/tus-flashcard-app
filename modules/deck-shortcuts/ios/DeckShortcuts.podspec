Pod::Spec.new do |s|
  s.name           = 'DeckShortcuts'
  s.version        = '1.0.0'
  s.summary        = 'Creates deck-specific Apple Shortcuts.'
  s.description    = 'Expo module for presenting and opening deck-specific iOS Shortcuts.'
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
