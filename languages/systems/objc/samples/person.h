#import <Foundation/Foundation.h>

@protocol Greeting <NSObject>
- (NSString *)greet:(NSString *)name prefix:(NSString *)prefix;
@end

@interface Person : NSObject <Greeting>
@property(nonatomic, strong, nullable) NSString *name;
@property(nonatomic, assign, getter=isReady) BOOL ready;
- (instancetype)initWithName:(NSString *)name;
@end
